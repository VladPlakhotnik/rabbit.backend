import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'

import { User } from '../users/user.entity'
import type { VipEarning } from './vip-earning.logic'
import { VipLedger } from './vip-ledger.entity'

interface VipEarningRecord extends VipEarning {
  sourceId?: string | null
  metadata?: Record<string, unknown>
}

const roundVipAmount = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

@Injectable()
export class VipService {
  async recordEarning(
    manager: EntityManager,
    user: User,
    earning: VipEarningRecord,
  ): Promise<void> {
    if (earning.vipXp <= 0 && earning.theoreticalRake <= 0) {
      return
    }

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
  }
}
