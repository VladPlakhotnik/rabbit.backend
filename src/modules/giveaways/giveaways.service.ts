import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, LessThanOrEqual, MoreThan, Repository } from 'typeorm'
import { Giveaway, GiveawayStatus } from './entities/giveaway.entity'
import { User } from '../users/user.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { NotificationService } from '../notifications/notification.service'
import {
  findGiveawayTier,
  getEligibleDepositAmount,
  GIVEAWAY_TIERS,
  type GiveawayTierConfig,
  type GiveawayType,
  getGiveawayBotTarget,
  pickGiveawayBotId,
  pickGiveawayWinnerId,
  shouldJoinGiveawayBot,
  shouldMaintainActiveGiveaways,
} from './giveaways.logic'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { SkinStatus } from '../skins/shared/skin-status.enum'
import { BotProfileService } from '../bots/bot-profile.service'
import { UserDeposit, UserDepositStatus } from '../users/user-deposit.entity'

const GIVEAWAY_ADVISORY_LOCK_ID = 5005
const GIVEAWAY_DEPOSIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const GIVEAWAY_SKIN_ITEM_TYPES = [
  'pistol',
  'rifle',
  'smg',
  'shotgun',
  'sniper rifle',
  'machinegun',
]

interface FinalizedGiveawayAward {
  giveawayId: number
  giveawayName: string
  skinName: string
  winnerUserId: number
}

@Injectable()
export class GiveawaysService {
  private readonly logger = new Logger(GiveawaysService.name)

  constructor(
    @InjectRepository(Giveaway)
    private readonly giveawayRepository: Repository<Giveaway>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserInventory)
    private readonly userInventoryRepository: Repository<UserInventory>,
    private readonly notificationService: NotificationService,
    private readonly botProfileService: BotProfileService,
  ) {}

  /**
   * Get all giveaways with all information
   */
  async findAll(): Promise<Giveaway[]> {
    await this.finalizeExpiredGiveaways()
    await this.ensureActiveGiveaway()

    const giveaways = await this.giveawayRepository.find({
      relations: ['skin', 'winner'],
      order: {
        created_at: 'DESC',
      },
    })

    return this.mapGiveawaysWithLimitedWinner(giveaways)
  }

  /**
   * Get all upcoming giveaways
   */
  async findAllActive(): Promise<Giveaway[]> {
    const now = new Date()
    let giveaways = await this.findActiveGiveaways(now)

    if (
      shouldMaintainActiveGiveaways(
        giveaways.map(giveaway => giveaway.giveaway_type),
      )
    ) {
      await this.finalizeExpiredGiveaways(now)
      await this.ensureActiveGiveaway(now)
      giveaways = await this.findActiveGiveaways(now)
    }

    return this.mapGiveawaysWithLimitedWinner(giveaways)
  }

  private async findActiveGiveaways(now: Date): Promise<Giveaway[]> {
    return this.giveawayRepository.find({
      where: {
        status: GiveawayStatus.ACTIVE,
        start_time: LessThanOrEqual(now),
        end_time: MoreThan(now),
      },
      relations: ['skin'],
      order: {
        required_deposit_amount: 'ASC',
        end_time: 'ASC',
      },
    })
  }

  /**
   * Get all completed giveaways with winners
   */
  async findAllWinners(): Promise<Giveaway[]> {
    await this.finalizeExpiredGiveaways()

    const giveaways = await this.giveawayRepository
      .createQueryBuilder('giveaway')
      .leftJoinAndSelect('giveaway.skin', 'skin')
      .leftJoinAndSelect('giveaway.winner', 'winner')
      .where('giveaway.status = :status', { status: GiveawayStatus.COMPLETED })
      .andWhere('giveaway.winner_user_id IS NOT NULL')
      .orderBy('giveaway.end_time', 'DESC')
      .getMany()

    return this.mapGiveawaysWithLimitedWinner(giveaways)
  }

  /**
   * Participate in a giveaway
   */
  async participate(giveawayId: number, userId: number): Promise<Giveaway> {
    const now = new Date()
    await this.finalizeExpiredGiveaways(now)

    const joinedGiveaway = await this.giveawayRepository.manager.transaction(
      async manager => {
        const giveaway = await manager
          .createQueryBuilder(Giveaway, 'giveaway')
          .where('giveaway.id = :giveawayId', { giveawayId })
          .setLock('pessimistic_write')
          .getOne()

        if (!giveaway) {
          throw new NotFoundException('Giveaway not found')
        }

        if (giveaway.status !== GiveawayStatus.ACTIVE) {
          throw new BadRequestException(
            `Cannot participate in giveaway with status: ${giveaway.status}`,
          )
        }

        if (now < giveaway.start_time) {
          throw new BadRequestException('Giveaway has not started yet')
        }

        if (now >= giveaway.end_time) {
          throw new BadRequestException('Giveaway has already ended')
        }

        const participantIds = Array.from(new Set(giveaway.participants ?? []))

        if (participantIds.includes(userId)) {
          throw new BadRequestException(
            'User is already participating in this giveaway',
          )
        }

        const user = await manager.findOne(User, {
          where: { id: userId },
        })

        if (!user) {
          throw new NotFoundException('User not found')
        }

        const eligibleDepositAmount =
          await this.getEligibleDepositAmountForWindow(manager, user, now)

        if (eligibleDepositAmount < giveaway.required_deposit_amount) {
          throw new BadRequestException(
            `User eligible 30-day deposit amount (${eligibleDepositAmount}) is less than required (${giveaway.required_deposit_amount})`,
          )
        }

        giveaway.participants = [...participantIds, userId]
        giveaway.participant_count = giveaway.participants.length

        return manager.save(Giveaway, giveaway)
      },
    )

    this.logger.log(
      `User ${userId} joined giveaway ${giveawayId}. Total participants: ${joinedGiveaway.participant_count}`,
    )

    const giveawayWithWinner = await this.giveawayRepository.findOne({
      where: { id: giveawayId },
      relations: ['skin', 'winner'],
    })

    if (!giveawayWithWinner) {
      throw new NotFoundException('Giveaway not found')
    }

    return this.mapGiveawayWithLimitedWinner(giveawayWithWinner)
  }

  @Cron('*/30 * * * * *')
  async maintainGiveawaysJob(): Promise<void> {
    try {
      const now = new Date()
      await this.finalizeExpiredGiveaways(now)
      await this.ensureActiveGiveaway(now)
      await this.joinBotParticipants(now)
    } catch (error) {
      this.logger.error(
        `Failed to maintain giveaways: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  async finalizeExpiredGiveaways(
    now = new Date(),
  ): Promise<FinalizedGiveawayAward[]> {
    const hasExpiredGiveaways = await this.giveawayRepository.exists({
      where: {
        status: GiveawayStatus.ACTIVE,
        end_time: LessThanOrEqual(now),
      },
    })

    if (!hasExpiredGiveaways) {
      return []
    }

    const awards = await this.giveawayRepository.manager.transaction(
      async manager => {
        const expiredGiveaways = await manager
          .createQueryBuilder(Giveaway, 'giveaway')
          .where('giveaway.status = :status', {
            status: GiveawayStatus.ACTIVE,
          })
          .andWhere('giveaway.end_time <= :now', { now })
          .setLock('pessimistic_write')
          .getMany()

        const finalizedAwards: FinalizedGiveawayAward[] = []

        for (const giveaway of expiredGiveaways) {
          const participantIds = Array.from(new Set(giveaway.participants ?? []))
          giveaway.participants = participantIds
          giveaway.participant_count = participantIds.length

          const winnerUserId = pickGiveawayWinnerId(participantIds)

          if (!winnerUserId) {
            giveaway.status = GiveawayStatus.CANCELLED
            giveaway.winner_user_id = null
            await manager.save(Giveaway, giveaway)
            this.logger.log(
              `Giveaway ${giveaway.id} cancelled: no participants`,
            )
            continue
          }

          giveaway.status = GiveawayStatus.COMPLETED
          giveaway.winner_user_id = winnerUserId
          await manager.save(Giveaway, giveaway)

          const inventoryItem = this.userInventoryRepository.create({
            user: { id: winnerUserId } as User,
            game_type: 'csgo',
            csgo_skin_id: giveaway.skin_id,
            dota_skin_id: null,
            obtained_at: now,
            is_sold: false,
            is_withdrawn: false,
            withdrawn_at: null,
          })

          await manager.save(UserInventory, inventoryItem)

          const skin = await manager.findOne(CsgoSkin, {
            where: { id: giveaway.skin_id },
          })

          finalizedAwards.push({
            giveawayId: giveaway.id,
            giveawayName: giveaway.name,
            skinName: skin?.name ?? giveaway.name,
            winnerUserId,
          })
        }

        return finalizedAwards
      },
    )

    await Promise.all(
      awards.map(async award => {
        try {
          await this.notificationService.notifyGiveawayWon(
            award.winnerUserId,
            award.giveawayName,
            award.skinName,
          )
        } catch (error) {
          this.logger.warn(
            `Giveaway ${award.giveawayId} was finalized, but winner notification failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
      }),
    )

    if (awards.length > 0) {
      this.logger.log(`Finalized ${awards.length} expired giveaways`)
    }

    return awards
  }

  async ensureActiveGiveaway(now = new Date()): Promise<Giveaway | null> {
    return this.giveawayRepository.manager.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [
        GIVEAWAY_ADVISORY_LOCK_ID,
      ])

      await this.cancelUnsupportedActiveGiveaways(manager, now)

      const createdGiveaways: Giveaway[] = []

      for (const tier of GIVEAWAY_TIERS) {
        const activeGiveaway = await manager.findOne(Giveaway, {
          where: {
            giveaway_type: tier.type,
            status: GiveawayStatus.ACTIVE,
            start_time: LessThanOrEqual(now),
            end_time: MoreThan(now),
          },
          order: { end_time: 'DESC' },
        })

        if (activeGiveaway) {
          const isPrizeStillValid = await this.isActiveGiveawayPrizeValid(
            manager,
            activeGiveaway,
            tier,
          )

          if (isPrizeStillValid) {
            continue
          }

          await manager.update(
            Giveaway,
            { id: activeGiveaway.id },
            {
              status: GiveawayStatus.CANCELLED,
              end_time: now,
            },
          )

          this.logger.warn(
            `Cancelled ${tier.type} giveaway ${activeGiveaway.id}: prize is outside active tier range`,
          )
        }

        const previousSkinId = await this.findLastGiveawaySkinId(
          manager,
          tier.type,
        )
        const skin = await this.pickCycleSkin(manager, tier, previousSkinId)

        if (!skin) {
          this.logger.warn(
            `No CSGO skin near ${tier.targetPrice} found for ${tier.type} giveaway cycle`,
          )
          continue
        }

        const giveaway = manager.create(Giveaway, {
          name: tier.name,
          giveaway_type: tier.type,
          skin_id: skin.id,
          participant_count: 0,
          required_deposit_amount: tier.requiredDepositAmount,
          participants: [],
          start_time: now,
          end_time: new Date(now.getTime() + tier.durationMs),
          status: GiveawayStatus.ACTIVE,
          winner_user_id: null,
        })

        const savedGiveaway = await manager.save(Giveaway, giveaway)
        createdGiveaways.push(savedGiveaway)

        this.logger.log(
          `Created ${tier.type} giveaway ${savedGiveaway.id} for skin ${skin.id} (${skin.name})`,
        )
      }

      return createdGiveaways[0] ?? null
    })
  }

  async joinBotParticipants(now = new Date()): Promise<number> {
    const activeGiveaways = await this.giveawayRepository.find({
      where: {
        status: GiveawayStatus.ACTIVE,
        start_time: LessThanOrEqual(now),
        end_time: MoreThan(now),
      },
      order: { end_time: 'ASC' },
    })

    if (activeGiveaways.length === 0) {
      return 0
    }

    const botProfiles = await this.botProfileService.getBotProfiles()
    const botIds = botProfiles.map(bot => bot.id)

    if (botIds.length === 0) {
      return 0
    }

    let joined = 0

    for (const giveaway of activeGiveaways) {
      const tier = findGiveawayTier(giveaway.giveaway_type)

      if (!tier) {
        continue
      }

      const participantIds = Array.from(new Set(giveaway.participants ?? []))
      const botParticipantCount = participantIds.filter(participantId =>
        botIds.includes(participantId),
      ).length
      const botTarget = getGiveawayBotTarget(
        giveaway.id,
        tier.minBots,
        tier.maxBots,
      )
      const durationMs = Math.max(
        1,
        giveaway.end_time.getTime() - giveaway.start_time.getTime(),
      )
      const elapsedMs = now.getTime() - giveaway.start_time.getTime()

      if (
        !shouldJoinGiveawayBot({
          botParticipantCount,
          botTarget,
          elapsedMs,
          durationMs,
        })
      ) {
        continue
      }

      const botId = pickGiveawayBotId(botIds, participantIds)

      if (!botId) {
        continue
      }

      const didJoin = await this.addBotParticipant(
        giveaway.id,
        botId,
        now,
        tier,
        botIds,
      )

      if (didJoin) {
        joined += 1
      }
    }

    if (joined > 0) {
      this.logger.log(`Added ${joined} bot participant(s) to giveaways`)
    }

    return joined
  }

  /**
   * Get giveaway by ID
   */
  async findById(id: number): Promise<Giveaway> {
    const giveaway = await this.giveawayRepository.findOne({
      where: { id },
      relations: ['skin', 'winner'],
    })

    if (!giveaway) {
      throw new NotFoundException('Giveaway not found')
    }

    return this.mapGiveawayWithLimitedWinner(giveaway)
  }

  /**
   * Map giveaway with limited winner fields (only id, display_name, avatar)
   */
  private mapGiveawayWithLimitedWinner(giveaway: Giveaway): Giveaway {
    if (giveaway.winner) {
      giveaway.winner = {
        id: giveaway.winner.id,
        display_name: giveaway.winner.display_name,
        avatar: giveaway.winner.avatar,
      } as User
    }
    return giveaway
  }

  /**
   * Map multiple giveaways with limited winner fields
   */
  private mapGiveawaysWithLimitedWinner(giveaways: Giveaway[]): Giveaway[] {
    return giveaways.map(giveaway =>
      this.mapGiveawayWithLimitedWinner(giveaway),
    )
  }

  private async addBotParticipant(
    giveawayId: number,
    botId: number,
    now: Date,
    tier: GiveawayTierConfig,
    botIds: number[],
  ): Promise<boolean> {
    return this.giveawayRepository.manager.transaction(async manager => {
      const giveaway = await manager
        .createQueryBuilder(Giveaway, 'giveaway')
        .where('giveaway.id = :giveawayId', { giveawayId })
        .setLock('pessimistic_write')
        .getOne()

      if (!giveaway) {
        return false
      }

      if (
        giveaway.status !== GiveawayStatus.ACTIVE ||
        now < giveaway.start_time ||
        now >= giveaway.end_time
      ) {
        return false
      }

      const participantIds = Array.from(new Set(giveaway.participants ?? []))
      const botIdSet = new Set(botIds)
      const botParticipantCount = participantIds.filter(participantId =>
        botIdSet.has(participantId),
      ).length
      const botTarget = getGiveawayBotTarget(
        giveaway.id,
        tier.minBots,
        tier.maxBots,
      )

      if (
        participantIds.includes(botId) ||
        botParticipantCount >= botTarget
      ) {
        return false
      }

      giveaway.participants = [...participantIds, botId]
      giveaway.participant_count = giveaway.participants.length
      await manager.save(Giveaway, giveaway)

      return true
    })
  }

  private async findLastGiveawaySkinId(
    manager: EntityManager,
    giveawayType: GiveawayType,
  ): Promise<number | null> {
    const latestGiveaway = await manager
      .createQueryBuilder(Giveaway, 'giveaway')
      .select('giveaway.skin_id', 'skin_id')
      .where('giveaway.giveaway_type = :giveawayType', { giveawayType })
      .orderBy('giveaway.created_at', 'DESC')
      .limit(1)
      .getRawOne<{ skin_id: number }>()

    return latestGiveaway?.skin_id ?? null
  }

  private async pickCycleSkin(
    manager: EntityManager,
    tier: GiveawayTierConfig,
    previousSkinId: number | null,
  ): Promise<CsgoSkin | null> {
    const query = manager
      .createQueryBuilder(CsgoSkin, 'skin')
      .where('skin.status = :status', { status: SkinStatus.Available })
      .andWhere('LOWER(skin.item_type) IN (:...skinItemTypes)', {
        skinItemTypes: GIVEAWAY_SKIN_ITEM_TYPES,
      })
      .andWhere('skin.market_price BETWEEN :minPrice AND :maxPrice', {
        minPrice: tier.minPrice,
        maxPrice: tier.maxPrice,
      })
      .andWhere("skin.name IS NOT NULL AND skin.name <> ''")
      .andWhere(
        "skin.market_hash_name IS NOT NULL AND skin.market_hash_name <> ''",
      )
      .andWhere("skin.image IS NOT NULL AND skin.image <> ''")
      .orderBy('RANDOM()')
      .limit(1)

    if (previousSkinId) {
      query.andWhere('skin.id != :previousSkinId', { previousSkinId })
    }

    const skin = await query.getOne()

    if (skin) {
      return skin
    }

    return manager
      .createQueryBuilder(CsgoSkin, 'skin')
      .where('skin.status = :status', { status: SkinStatus.Available })
      .andWhere('LOWER(skin.item_type) IN (:...skinItemTypes)', {
        skinItemTypes: GIVEAWAY_SKIN_ITEM_TYPES,
      })
      .andWhere('skin.market_price BETWEEN :minPrice AND :maxPrice', {
        minPrice: tier.fallbackMinPrice,
        maxPrice: tier.fallbackMaxPrice,
      })
      .andWhere("skin.name IS NOT NULL AND skin.name <> ''")
      .andWhere(
        "skin.market_hash_name IS NOT NULL AND skin.market_hash_name <> ''",
      )
      .andWhere("skin.image IS NOT NULL AND skin.image <> ''")
      .orderBy('ABS(skin.market_price - :targetPrice)', 'ASC')
      .setParameter('targetPrice', tier.targetPrice)
      .limit(1)
      .getOne()
  }

  private async cancelUnsupportedActiveGiveaways(
    manager: EntityManager,
    now: Date,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(Giveaway)
      .set({
        status: GiveawayStatus.CANCELLED,
        end_time: now,
      })
      .where('status = :status', { status: GiveawayStatus.ACTIVE })
      .andWhere(
        '(giveaway_type IS NULL OR giveaway_type NOT IN (:...giveawayTypes))',
        { giveawayTypes: GIVEAWAY_TIERS.map(tier => tier.type) },
      )
      .execute()
  }

  private async isActiveGiveawayPrizeValid(
    manager: EntityManager,
    giveaway: Giveaway,
    tier: GiveawayTierConfig,
  ): Promise<boolean> {
    const skin = await manager.findOne(CsgoSkin, {
      where: { id: giveaway.skin_id },
    })

    if (!skin) {
      return false
    }

    const itemType = skin.item_type?.toLowerCase()

    return (
      skin.status === SkinStatus.Available &&
      skin.market_price >= tier.minPrice &&
      skin.market_price <= tier.maxPrice &&
      Boolean(itemType && GIVEAWAY_SKIN_ITEM_TYPES.includes(itemType)) &&
      Boolean(skin.name?.trim()) &&
      Boolean(skin.market_hash_name?.trim()) &&
      Boolean(skin.image?.trim())
    )
  }

  private async getEligibleDepositAmountForWindow(
    manager: EntityManager,
    user: User,
    now: Date,
  ): Promise<number> {
    const windowStart = new Date(now.getTime() - GIVEAWAY_DEPOSIT_WINDOW_MS)

    const [ledgerRowsCount, ledgerAmountRow] = await Promise.all([
      manager.count(UserDeposit, {
        where: {
          user_id: user.id,
        },
      }),
      manager
        .createQueryBuilder(UserDeposit, 'deposit')
        .select('COALESCE(SUM(deposit.amount), 0)', 'amount')
        .where('deposit.user_id = :userId', { userId: user.id })
        .andWhere('deposit.status = :status', {
          status: UserDepositStatus.SUCCESS,
        })
        .andWhere('deposit.created_at >= :windowStart', { windowStart })
        .getRawOne<{ amount: string | number | null }>(),
    ])

    return getEligibleDepositAmount({
      ledgerRowsCount,
      ledgerAmount30d: Number(ledgerAmountRow?.amount ?? 0),
      legacyDepositAmount: Number(user.deposit_amount ?? 0),
    })
  }
}
