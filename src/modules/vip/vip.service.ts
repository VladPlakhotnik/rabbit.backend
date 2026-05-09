import { Injectable, Logger } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { User } from '../users/user.entity'
import type { VipEarning } from './vip-earning.logic'
import { VipLedger } from './vip-ledger.entity'
import { NotificationService } from '../notifications/notification.service'
import { getVipTierForXp } from './vip-rewards.logic'

interface VipEarningRecord extends VipEarning {
  sourceId?: string | null
  metadata?: Record<string, unknown>
}

const roundVipAmount = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

@Injectable()
export class VipService {
  private readonly logger = new Logger(VipService.name)

  constructor(private readonly notificationService: NotificationService) {}

  async recordEarning(
    manager: EntityManager,
    user: User,
    earning: VipEarningRecord,
  ): Promise<void> {
    if (earning.vipXp <= 0 && earning.theoreticalRake <= 0) {
      return
    }

    const previousTier = getVipTierForXp(
      user.vip_xp ?? user.vip_qualifying_volume ?? 0,
    )

    user.vip_xp = roundVipAmount((user.vip_xp ?? 0) + earning.vipXp)
    user.vip_theoretical_rake = roundVipAmount(
      (user.vip_theoretical_rake ?? 0) + earning.theoreticalRake,
    )
    user.vip_qualifying_volume = roundVipAmount(
      (user.vip_qualifying_volume ?? 0) + earning.vipXp,
    )

    await manager.save(user)

    const ledgerEntry = manager.create(VipLedger, {
      user_id: user.id,
      source_type: earning.sourceType,
      source_id: earning.sourceId ?? null,
      wager_amount: earning.wagerAmount,
      house_edge_bps: earning.houseEdgeBps,
      product_xp_rate_bps: earning.productXpRateBps,
      theoretical_rake: earning.theoreticalRake,
      vip_xp: earning.vipXp,
      metadata: earning.metadata ?? {},
    })

    await manager.save(VipLedger, ledgerEntry)

    const nextTier = getVipTierForXp(
      user.vip_xp ?? user.vip_qualifying_volume ?? 0,
    )
    if (nextTier.id !== previousTier.id) {
      await this.notifyLevelUp(user.id, nextTier.id, nextTier.threshold)
    }
  }

  private async notifyLevelUp(
    userId: number,
    tierId: string,
    threshold: number,
  ): Promise<void> {
    try {
      await this.notificationService.notifyVipLevelUp(userId, tierId, threshold)
    } catch (err) {
      this.logger.warn(
        `Failed to create VIP level-up notification for user ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }
}
