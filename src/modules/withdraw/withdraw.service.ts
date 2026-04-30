import * as crypto from 'crypto'
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Cron } from '@nestjs/schedule'
import { In, Repository } from 'typeorm'
import { Withdrawal, WithdrawalStatus } from './withdrawal.entity'
import { parseTradeUrl } from './trade-url.parser'
import { UserInventory } from '../userInventory/userInventory.entity'
import {
  TM_BUY_FOR_ERROR_KEYS,
  TmBuyForResponse,
  TmMarketClient,
  TmOrder,
} from '../skins/shared/market-tm.client'

// Injection tokens for the per-game TM clients. Same literals as in
// `skin.module.ts` — keep them here as constants to avoid a circular
// import on the module file.
const TM_CSGO_CLIENT_TOKEN = 'TM_CSGO_CLIENT'
const TM_DOTA2_CLIENT_TOKEN = 'TM_DOTA2_CLIENT'

// Polling cadence for in-flight withdrawals. TM's order lifecycle
// (created → approved → trade dispatched → user accepts) takes from a
// few seconds (instant trades) to a few minutes (manual approvals).
// Every 30s strikes the balance between "fresh enough that the UI
// feels live" and "cheap enough that we don't burn TM rate budget on
// idle accounts". The Steam Skins UI on the frontend polls
// /withdraw/me every ~10s independently — it sees stage transitions
// up to one cron-tick late, which is fine.
const POLL_INTERVAL_CRON = '*/30 * * * * *'

interface WithdrawalRequestResult {
  withdrawals: Array<{
    id: number
    inventory_item_id: number
    status: WithdrawalStatus
    failure_reason: string | null
  }>
}

@Injectable()
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name)

  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalRepo: Repository<Withdrawal>,
    @InjectRepository(UserInventory)
    private readonly inventoryRepo: Repository<UserInventory>,
    @Inject(TM_CSGO_CLIENT_TOKEN)
    private readonly tmCsgo: TmMarketClient,
    @Inject(TM_DOTA2_CLIENT_TOKEN)
    private readonly tmDota: TmMarketClient,
  ) {}

  /**
   * Initiate a Steam Skins withdrawal for one or more inventory items.
   *
   * Flow per item (sequential — TM doesn't batch buy-for):
   *   1. Lock the inventory row, validate ownership + state
   *   2. Mark `is_withdrawn = true` so it can't be sold/upgraded
   *      mid-flight
   *   3. Search TM for the cheapest live offer of this skin
   *   4. Call TM /buy-for with the user's trade URL
   *   5. Persist a Withdrawal row reflecting TM's response
   *
   * Items fail independently: one bad item rolls back its own
   * `is_withdrawn` and produces a `status='failed'` withdrawal row,
   * but doesn't block the rest of the batch.
   *
   * Same-game enforcement: all items must share `game_type` (mixed
   * CS+Dota withdraw isn't supported — different TM marketplaces with
   * separate balances).
   */
  async requestWithdrawal(
    userId: number,
    inventoryIds: number[],
    tradeUrlRaw: string,
  ): Promise<WithdrawalRequestResult> {
    if (!inventoryIds.length) {
      throw new BadRequestException('inventory_ids must not be empty')
    }
    if (inventoryIds.length > 50) {
      throw new BadRequestException('Cannot withdraw more than 50 items at once')
    }

    const tradeUrl = parseTradeUrl(tradeUrlRaw)
    if (!tradeUrl) {
      throw new BadRequestException(
        'Invalid Steam trade URL. Expected ' +
          '"https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."',
      )
    }

    // Lock + validate the whole batch in one transaction. Per-item TM
    // calls happen *after* the lock release — TM is slow (seconds),
    // and holding the inventory rows locked through the network
    // round-trip would block sells / upgrades unnecessarily. The
    // `is_withdrawn = true` flag we set inside the transaction is
    // what guards the items going forward.
    const items = await this.inventoryRepo.manager.transaction(
      async (manager) => {
        const rows = await manager
          .createQueryBuilder(UserInventory, 'inv')
          .leftJoinAndSelect('inv.csgoSkin', 'csgoSkin')
          .leftJoinAndSelect('inv.dotaSkin', 'dotaSkin')
          .where('inv.id IN (:...ids)', { ids: inventoryIds })
          .andWhere('inv.user_id = :userId', { userId })
          .setLock('pessimistic_write', undefined, ['inv'])
          .getMany()

        if (rows.length !== inventoryIds.length) {
          throw new NotFoundException(
            'Some inventory items not found or do not belong to you',
          )
        }

        for (const row of rows) {
          if (row.is_sold) {
            throw new BadRequestException(
              `Inventory ${row.id} has already been sold`,
            )
          }
          if (row.is_withdrawn) {
            throw new BadRequestException(
              `Inventory ${row.id} is already being withdrawn`,
            )
          }
        }

        // Same-game enforcement (Default A).
        const firstGame = rows[0].game_type
        const wrongGame = rows.find((r) => r.game_type !== firstGame)
        if (wrongGame) {
          throw new BadRequestException(
            'All items in one withdrawal must be from the same game ' +
              `(found ${firstGame} and ${wrongGame.game_type})`,
          )
        }

        // Mark all as withdrawing — guard against parallel sell/upgrade.
        // Refunded individually if the TM call later fails.
        //
        // Set `withdrawn_at` together with `is_withdrawn=true`: the
        // existing CHECK constraint on user_inventory requires both
        // sides to flip together
        // (`is_withdrawn=TRUE AND withdrawn_at IS NOT NULL`). Semantically
        // this is "moment the withdrawal was initiated"; on a successful
        // completion it stays as the request time, on a refund we flip
        // is_withdrawn back to false (withdrawn_at may stay non-null —
        // the CHECK doesn't constrain the FALSE branch).
        const now = new Date()
        await manager
          .createQueryBuilder()
          .update(UserInventory)
          .set({ is_withdrawn: true, withdrawn_at: now })
          .where('id IN (:...ids)', { ids: inventoryIds })
          .execute()

        return rows
      },
    )

    const tmClient = this.tmClientFor(items[0].game_type)
    const results: WithdrawalRequestResult['withdrawals'] = []

    // Sequential — TM rate-limits per-account; parallel requests on
    // the same key would just queue server-side and risk burst-block.
    for (const item of items) {
      const result = await this.tryWithdrawOne(item, tradeUrl, tmClient)
      results.push(result)
    }

    return { withdrawals: results }
  }

  /**
   * Attempt a single-item withdrawal: TM search → buy-for → persist.
   * Self-contained error handling — a failure here marks the
   * withdrawal failed and refunds the inventory item.
   */
  private async tryWithdrawOne(
    item: UserInventory,
    tradeUrl: { partner: string; token: string },
    tmClient: TmMarketClient,
  ): Promise<WithdrawalRequestResult['withdrawals'][number]> {
    const customId = `wd_${crypto.randomUUID()}`
    const skin = item.skin
    const hashName = skin?.market_hash_name
    // Authorise TM at raw_market_price — what we actually pay them.
    // Markup is our profit margin; TM never sees it.
    const targetPrice = Number(skin?.raw_market_price ?? skin?.market_price ?? 0)

    if (!hashName || !Number.isFinite(targetPrice) || targetPrice <= 0) {
      await this.markFailedAndRefund(
        item,
        customId,
        tradeUrl,
        targetPrice,
        'skin_no_price',
      )
      return {
        id: -1,
        inventory_item_id: item.id,
        status: WithdrawalStatus.Failed,
        failure_reason: 'skin_no_price',
      }
    }

    // TM `/api/v2/buy-for` accepts `hash_name` directly — it picks the
    // cheapest live offer for that name on its side and tries to buy
    // it at or below our price cap. So no separate "search first" step
    // is needed (the older code did, against an endpoint that turned
    // out not to exist on market.csgo.com — it 401'd as unknown).
    //
    // Cap at target_price + 5% slip tolerance: if the live floor moved
    // up between our last price-sync and this call, we still go
    // through up to that margin; beyond it TM rejects with an error
    // and we refund the item. Keeps surprise overspend bounded.
    const maxPrice = targetPrice * 1.05

    let buyResult
    try {
      buyResult = await tmClient.buyForUser({
        hashName,
        maxPrice,
        partner: tradeUrl.partner,
        token: tradeUrl.token,
        customId,
      })
    } catch (err) {
      this.logger.error(
        `TM buy-for failed for inventory=${item.id} (${hashName}): ` +
          `${err instanceof Error ? err.message : err}`,
      )
      const w = await this.markFailedAndRefund(
        item,
        customId,
        tradeUrl,
        targetPrice,
        'tm_network_error',
      )
      return {
        id: w.id,
        inventory_item_id: item.id,
        status: WithdrawalStatus.Failed,
        failure_reason: w.failure_reason,
      }
    }

    if (!buyResult.success) {
      const reasonKey = this.resolveBuyForFailureKey(buyResult)
      // Log the raw upstream details for support/triage; the stable key
      // is what gets persisted as failure_reason and translated on the
      // frontend.
      this.logger.warn(
        `TM buy-for rejected inventory=${item.id} (${hashName}): ` +
          `code=${buyResult.code ?? 'n/a'} error="${buyResult.error ?? ''}" → key=${reasonKey}`,
      )
      const w = await this.markFailedAndRefund(
        item,
        customId,
        tradeUrl,
        targetPrice,
        reasonKey,
      )
      return {
        id: w.id,
        inventory_item_id: item.id,
        status: WithdrawalStatus.Failed,
        failure_reason: w.failure_reason,
      }
    }

    // Happy path — TM accepted the buy-for, will dispatch the trade.
    const withdrawal = this.withdrawalRepo.create({
      user_id: item.user?.id ?? (await this.resolveUserId(item.id)),
      inventory_item_id: item.id,
      game_type: item.game_type,
      status: WithdrawalStatus.Purchasing,
      custom_id: customId,
      tm_order_id: buyResult.id != null ? String(buyResult.id) : null,
      trade_url: this.serialiseTradeUrl(tradeUrl),
      target_price: targetPrice,
    })
    const saved = await this.withdrawalRepo.save(withdrawal)

    return {
      id: saved.id,
      inventory_item_id: item.id,
      status: WithdrawalStatus.Purchasing,
      failure_reason: null,
    }
  }

  /**
   * Restore inventory.is_withdrawn=false and persist a `failed`
   * Withdrawal row capturing why the request didn't go through.
   * Returns the persisted row for the caller to relay to the user.
   */
  private async markFailedAndRefund(
    item: UserInventory,
    customId: string,
    tradeUrl: { partner: string; token: string },
    targetPrice: number,
    failureReason: string,
  ): Promise<Withdrawal> {
    return this.withdrawalRepo.manager.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(UserInventory)
        .set({ is_withdrawn: false })
        .where('id = :id', { id: item.id })
        .execute()

      const withdrawal = manager.create(Withdrawal, {
        user_id: item.user?.id ?? (await this.resolveUserId(item.id)),
        inventory_item_id: item.id,
        game_type: item.game_type,
        status: WithdrawalStatus.Failed,
        custom_id: customId,
        tm_order_id: null,
        trade_url: this.serialiseTradeUrl(tradeUrl),
        target_price: targetPrice,
        failure_reason: failureReason,
        completed_at: new Date(),
      })
      return manager.save(withdrawal)
    })
  }

  // Some manager-built UserInventory rows come back with `user`
  // unloaded (we lock with `inv` only). When constructing the
  // withdrawal row we need user_id; pull it from the lazily-loaded
  // join column on the inventory if needed.
  private async resolveUserId(inventoryId: number): Promise<number> {
    const found = await this.inventoryRepo.findOne({
      where: { id: inventoryId },
      relations: ['user'],
    })
    if (!found?.user) {
      throw new NotFoundException(`Inventory ${inventoryId} has no user`)
    }
    return found.user.id
  }

  private serialiseTradeUrl(tradeUrl: { partner: string; token: string }): string {
    return `https://steamcommunity.com/tradeoffer/new/?partner=${tradeUrl.partner}&token=${tradeUrl.token}`
  }

  private tmClientFor(gameType: 'csgo' | 'dota'): TmMarketClient {
    return gameType === 'dota' ? this.tmDota : this.tmCsgo
  }

  /**
   * Pick a stable failure key for a rejected /buy-for response.
   *
   * TM returns `{ success:false, error:"...", code:N }`. We prefer the
   * `code` lookup because the strings change with their copy edits and
   * also vary by language; the numeric codes are stable per their docs.
   * Fall back to the raw `error` text when the code is missing or
   * unmapped — frontend i18n won't have a key for that string and will
   * fall through to displaying it as-is, which is still better than a
   * generic "something failed" message.
   */
  private resolveBuyForFailureKey(buyResult: TmBuyForResponse): string {
    if (typeof buyResult.code === 'number') {
      const mapped = TM_BUY_FOR_ERROR_KEYS[buyResult.code]
      if (mapped) return mapped
    }
    return buyResult.error || 'tm_unknown_error'
  }

  /**
   * Map a raw TM order to the canonical WithdrawalStatus.
   *
   * Why not just use TM's `stage` codes? In practice TM does NOT
   * advance `stage` past 1 even after the user has accepted the Steam
   * trade and TM has marked the order as completed on their side. We
   * verified this on a real successful withdrawal: stage stayed at "1"
   * while `settlement` got set to a future timestamp, `causer` stayed
   * null, and `paid` was non-zero. So the documented stage codes are
   * an internal lifecycle that doesn't correspond to user-visible
   * delivery state.
   *
   * Reliable signals (priority order):
   *   1. `stage === 5` OR (`settlement > 0` AND `causer` is set)
   *      → refund issued; this is `failed`.
   *   2. `settlement > 0` AND `causer` is null
   *      → user has received the item, money is in escrow until the
   *        settlement timestamp passes. From our user's perspective,
   *        this is `completed` — they have the skin in Steam.
   *   3. `trade_id` is set (and not yet 1 or 2)
   *      → Steam trade has been dispatched but not yet
   *        accepted; this is `delivering` — the user must open Steam
   *        and accept the trade.
   *   4. otherwise → TM is still preparing the buy; `purchasing`.
   */
  private deriveWithdrawalStatus(
    order: TmOrder,
  ): 'purchasing' | 'delivering' | 'completed' | 'failed' {
    const causerSet = order.causer != null && order.causer !== ''
    if (order.stage === 5 || (order.settlement > 0 && causerSet)) {
      return 'failed'
    }
    if (order.settlement > 0) {
      return 'completed'
    }
    if (order.trade_id != null && String(order.trade_id) !== '') {
      return 'delivering'
    }
    return 'purchasing'
  }

  // ---- User-facing read ---------------------------------------------

  /**
   * List the user's withdrawals, newest first. Default surface:
   * everything still in flight + the last 50 finalised. Frontend
   * polls this for in-progress UI.
   */
  async getUserWithdrawals(userId: number): Promise<Withdrawal[]> {
    return this.withdrawalRepo.find({
      where: { user_id: userId },
      relations: [
        'inventoryItem',
        'inventoryItem.csgoSkin',
        'inventoryItem.dotaSkin',
      ],
      order: { created_at: 'DESC' },
      take: 50,
    })
  }

  // ---- Polling --------------------------------------------------------
  //
  // Cron runs every 30s. For each in-flight withdrawal it:
  //   1. Calls TM `getOrderStatus(custom_id)` on the right marketplace
  //   2. Maps TM's numeric stage → WithdrawalStatus
  //   3. Updates the row + handles transitions:
  //        → completed: set actual_price, completed_at, leave inventory
  //          as-is (skin already on its way to user, is_withdrawn stays true)
  //        → failed: refund inventory.is_withdrawn=false, set
  //          failure_reason
  //
  // Errors in individual rows are caught + logged so one bad TM call
  // doesn't cascade across the batch. Cron itself is idempotent — the
  // status mapping converges (purchasing → delivering → completed).

  @Cron(POLL_INTERVAL_CRON)
  async pollOrderStatus(): Promise<void> {
    if (process.env.DISABLE_SCHEDULED_JOBS === 'true') return

    const inFlight = await this.withdrawalRepo.find({
      where: {
        status: In([
          WithdrawalStatus.Pending,
          WithdrawalStatus.Purchasing,
          WithdrawalStatus.Delivering,
        ]),
      },
      take: 200, // hard ceiling — never poll more than this in one tick
    })

    if (inFlight.length === 0) return

    for (const withdrawal of inFlight) {
      try {
        await this.advanceOne(withdrawal)
      } catch (err) {
        this.logger.error(
          `Failed to advance withdrawal ${withdrawal.id} (custom_id=${withdrawal.custom_id}): ` +
            `${err instanceof Error ? err.message : err}`,
        )
      }
    }
  }

  private async advanceOne(withdrawal: Withdrawal): Promise<void> {
    const tmClient = this.tmClientFor(withdrawal.game_type)
    const order = await tmClient.getOrderStatus(withdrawal.custom_id)

    // Order not found yet — TM may still be processing the buy-for.
    // Stay in current status; next cron tick will retry.
    if (!order) return

    const newStatus = this.deriveWithdrawalStatus(order)
    this.logger.debug(
      `Withdrawal ${withdrawal.id} (${withdrawal.custom_id}): TM order ` +
        `stage=${order.stage} settlement=${order.settlement} causer=${order.causer} ` +
        `trade_id=${order.trade_id} → ${newStatus}`,
    )

    // No-op transition.
    if (newStatus === withdrawal.status) return

    if (newStatus === 'completed') {
      // get-buy-info-by-custom-id returns `paid` as a float in major
      // units (USD: 0.9 = $0.90). Don't divide by 100 — that was the
      // old code reading the wrong endpoint shape.
      const paidNum =
        order.paid == null
          ? null
          : typeof order.paid === 'number'
            ? order.paid
            : Number.parseFloat(String(order.paid))
      const paidDollars = paidNum != null && Number.isFinite(paidNum) ? paidNum : null

      await this.withdrawalRepo.update(withdrawal.id, {
        status: WithdrawalStatus.Completed,
        actual_price: paidDollars,
        completed_at: new Date(),
        tm_order_id: withdrawal.tm_order_id ?? String(order.trade_id ?? ''),
      })
      this.logger.log(
        `Withdrawal ${withdrawal.id} completed (paid=${paidDollars}, target=${withdrawal.target_price})`,
      )
      return
    }

    if (newStatus === 'failed') {
      // Refund inventory + finalise withdrawal in one transaction so we
      // never end up with the skin trapped in is_withdrawn=true and the
      // withdrawal already failed.
      //
      // Stable failure keys (frontend translates to a localized message):
      //   `trade_timed_out_buyer`  — buyer didn't accept the Steam trade
      //   `trade_timed_out_seller` — seller didn't dispatch the item
      //   `trade_failed`            — generic stage=5 with no causer
      const reason =
        order.causer === 'buyer'
          ? 'trade_timed_out_buyer'
          : order.causer === 'seller'
            ? 'trade_timed_out_seller'
            : 'trade_failed'

      await this.withdrawalRepo.manager.transaction(async (manager) => {
        await manager
          .createQueryBuilder()
          .update(UserInventory)
          .set({ is_withdrawn: false })
          .where('id = :id', { id: withdrawal.inventory_item_id })
          .execute()

        await manager.update(Withdrawal, withdrawal.id, {
          status: WithdrawalStatus.Failed,
          failure_reason: reason,
          completed_at: new Date(),
        })
      })
      this.logger.warn(
        `Withdrawal ${withdrawal.id} failed (TM stage=${order.stage}, causer=${order.causer})`,
      )
      return
    }

    // Otherwise — purchasing or delivering — just update the status.
    await this.withdrawalRepo.update(withdrawal.id, {
      status:
        newStatus === 'delivering'
          ? WithdrawalStatus.Delivering
          : WithdrawalStatus.Purchasing,
    })
  }
}
