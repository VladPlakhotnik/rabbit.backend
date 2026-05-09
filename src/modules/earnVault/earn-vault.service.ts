import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'

import { IdempotencyService } from '../../core/idempotency/idempotency.service'
import { User } from '../users/user.entity'
import { CreateEarnVaultPositionDto } from './dto/create-earn-vault-position.dto'
import {
  EARN_VAULT_PLANS,
  calculateEarnVaultAccruedReward,
  calculateEarnVaultProgress,
  calculateEarnVaultReward,
  getEarnVaultEndDate,
  getEarnVaultPlan,
  isValidStakeAmount,
  isEarnVaultFlexible,
  isEarnVaultPositionMature,
  normaliseStakeAmount,
  roundMoney,
} from './earn-vault.logic'
import {
  EarnVaultPosition,
  EarnVaultPositionStatus,
} from './earn-vault-position.entity'

interface EarnVaultPositionDto {
  id: string
  plan_id: string
  plan_name: string
  status: EarnVaultPositionStatus
  amount: number
  reward_amount: number
  rate_percent: number
  duration_days: number
  starts_at: string
  ends_at: string
  claimed_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
  can_claim: boolean
  can_unstake: boolean
  progress_percent: number
  total_return: number
}

interface EarnVaultSummary {
  plans: typeof EARN_VAULT_PLANS
  available_balance: number
  vault_balance: number
  pending_reward: number
  ready_reward: number
  claimed_reward: number
  active_position_count: number
  active_position_limit: number
  positions: EarnVaultPositionDto[]
}

interface EarnVaultActionResult {
  position: EarnVaultPositionDto
  new_balance: number
}

export const EARN_VAULT_POSITION_LIST_LIMIT = 100
export const EARN_VAULT_ACTIVE_POSITION_LIMIT = 25

@Injectable()
export class EarnVaultService {
  constructor(
    @InjectRepository(EarnVaultPosition)
    private readonly positionRepository: Repository<EarnVaultPosition>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async getSummary(userId: number): Promise<EarnVaultSummary> {
    const user = await this.userRepository.findOne({ where: { id: userId } })
    if (!user) {
      throw new NotFoundException('User not found')
    }

    const summaryPositions = await this.positionRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    })
    const visiblePositions = summaryPositions.slice(0, EARN_VAULT_POSITION_LIST_LIMIT)
    const activePositionCount = this.countActivePositions(summaryPositions)
    const now = new Date()

    return {
      plans: EARN_VAULT_PLANS,
      available_balance: Number(user.balance),
      vault_balance: this.sumPositions(summaryPositions, item =>
        item.status === 'active' ? item.amount : 0,
      ),
      pending_reward: this.sumPositions(summaryPositions, item =>
        item.status === 'active' &&
        !isEarnVaultFlexible(item) &&
        !isEarnVaultPositionMature(item, now)
          ? this.getPositionRewardAmount(item, now)
          : 0,
      ),
      ready_reward: this.sumPositions(summaryPositions, item =>
        item.status === 'active' &&
        (isEarnVaultFlexible(item) || isEarnVaultPositionMature(item, now))
          ? this.getPositionRewardAmount(item, now)
          : 0,
      ),
      claimed_reward: this.sumPositions(summaryPositions, item =>
        item.status === 'claimed' ? item.reward_amount : 0,
      ),
      active_position_count: activePositionCount,
      active_position_limit: EARN_VAULT_ACTIVE_POSITION_LIMIT,
      positions: visiblePositions.map(position => this.toPositionDto(position, now)),
    }
  }

  async createPosition(
    userId: number,
    dto: CreateEarnVaultPositionDto,
    idempotencyKey?: string | string[],
  ): Promise<EarnVaultActionResult> {
    return this.idempotencyService.run(
      'earn-vault-create-position',
      userId,
      idempotencyKey,
      () => this.createPositionOnce(userId, dto),
    )
  }

  private async createPositionOnce(
    userId: number,
    dto: CreateEarnVaultPositionDto,
  ): Promise<EarnVaultActionResult> {
    const plan = getEarnVaultPlan(dto.plan_id)
    if (!plan) {
      throw new BadRequestException('Unknown Earn Vault plan')
    }

    if (!isValidStakeAmount(dto.amount)) {
      throw new BadRequestException(
        'Stake amount must be a positive number with up to 2 decimal places',
      )
    }

    const amount = normaliseStakeAmount(dto.amount)
    if (amount < plan.minAmount) {
      throw new BadRequestException(
        `Minimum amount for ${plan.name} is ${plan.minAmount}`,
      )
    }
    if (amount > plan.maxAmount) {
      throw new BadRequestException(
        `Maximum amount for ${plan.name} is ${plan.maxAmount}`,
      )
    }

    return this.positionRepository.manager.transaction(async manager => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!user) {
        throw new NotFoundException('User not found')
      }
      if (Number(user.balance) < amount) {
        throw new BadRequestException('Insufficient balance')
      }

      const activePositionCount = await manager.count(EarnVaultPosition, {
        where: { user_id: userId, status: 'active' },
      })
      if (activePositionCount >= EARN_VAULT_ACTIVE_POSITION_LIMIT) {
        throw new BadRequestException(
          `Maximum active Earn Vault positions is ${EARN_VAULT_ACTIVE_POSITION_LIMIT}`,
        )
      }

      const startsAt = new Date()
      const position = manager.create(EarnVaultPosition, {
        user_id: userId,
        plan_id: plan.id,
        plan_name: plan.name,
        status: 'active',
        amount,
        reward_amount: calculateEarnVaultReward(amount, plan),
        rate_percent: plan.ratePercent,
        duration_days: plan.durationDays,
        starts_at: startsAt,
        ends_at: getEarnVaultEndDate(startsAt, plan.durationDays),
        claimed_at: null,
        cancelled_at: null,
      })

      user.balance = roundMoney(Number(user.balance) - amount)
      await manager.save(User, user)

      const saved = await manager.save(EarnVaultPosition, position)

      return {
        position: this.toPositionDto(saved),
        new_balance: Number(user.balance),
      }
    })
  }

  async claimPosition(
    userId: number,
    positionId: string,
  ): Promise<EarnVaultActionResult> {
    return this.positionRepository.manager.transaction(async manager => {
      const position = await manager.findOne(EarnVaultPosition, {
        where: { id: positionId, user_id: userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!position) {
        throw new NotFoundException('Earn Vault position not found')
      }
      if (position.status !== 'active') {
        throw new BadRequestException('Earn Vault position is not active')
      }
      if (
        !isEarnVaultFlexible(position) &&
        !isEarnVaultPositionMature(position)
      ) {
        throw new BadRequestException('Earn Vault position is not ready yet')
      }

      const user = await this.findLockedUser(manager, userId)
      const rewardAmount = this.getPositionRewardAmount(position)
      user.balance = roundMoney(
        Number(user.balance) + position.amount + rewardAmount,
      )

      position.status = 'claimed'
      position.reward_amount = rewardAmount
      position.claimed_at = new Date()

      await manager.save(User, user)
      const saved = await manager.save(EarnVaultPosition, position)

      return {
        position: this.toPositionDto(saved),
        new_balance: Number(user.balance),
      }
    })
  }

  async unstakePosition(
    userId: number,
    positionId: string,
  ): Promise<EarnVaultActionResult> {
    return this.positionRepository.manager.transaction(async manager => {
      const position = await manager.findOne(EarnVaultPosition, {
        where: { id: positionId, user_id: userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!position) {
        throw new NotFoundException('Earn Vault position not found')
      }
      if (position.status !== 'active') {
        throw new BadRequestException('Earn Vault position is not active')
      }
      if (isEarnVaultFlexible(position)) {
        throw new BadRequestException(
          'Flexible Vault can be claimed at any time',
        )
      }
      if (isEarnVaultPositionMature(position)) {
        throw new BadRequestException('Earn Vault position is ready to claim')
      }

      const user = await this.findLockedUser(manager, userId)
      user.balance = roundMoney(Number(user.balance) + position.amount)

      position.status = 'cancelled'
      position.cancelled_at = new Date()

      await manager.save(User, user)
      const saved = await manager.save(EarnVaultPosition, position)

      return {
        position: this.toPositionDto(saved),
        new_balance: Number(user.balance),
      }
    })
  }

  private async findLockedUser(
    manager: EntityManager,
    userId: number,
  ): Promise<User> {
    const user = await manager.findOne(User, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    })
    if (!user) {
      throw new NotFoundException('User not found')
    }

    return user
  }

  private sumPositions(
    positions: EarnVaultPosition[],
    pickValue: (position: EarnVaultPosition) => number,
  ): number {
    return roundMoney(
      positions.reduce((sum, position) => sum + pickValue(position), 0),
    )
  }

  private countActivePositions(positions: EarnVaultPosition[]): number {
    return positions.reduce(
      (count, position) => count + (position.status === 'active' ? 1 : 0),
      0,
    )
  }

  private getPositionRewardAmount(
    position: EarnVaultPosition,
    now = new Date(),
  ): number {
    if (isEarnVaultFlexible(position) && position.status === 'active') {
      return calculateEarnVaultAccruedReward(
        Number(position.amount),
        { ratePercent: Number(position.rate_percent) },
        position.starts_at,
        now,
      )
    }

    return Number(position.reward_amount)
  }

  private toPositionDto(
    position: EarnVaultPosition,
    now = new Date(),
  ): EarnVaultPositionDto {
    const canClaim =
      position.status === 'active' && isEarnVaultPositionMature(position, now)
    const canUnstake =
      position.status === 'active' &&
      !isEarnVaultFlexible(position) &&
      !canClaim
    const createdAt = position.created_at ?? now
    const updatedAt = position.updated_at ?? createdAt
    const rewardAmount = this.getPositionRewardAmount(position, now)

    return {
      id: position.id,
      plan_id: position.plan_id,
      plan_name: position.plan_name,
      status: position.status,
      amount: Number(position.amount),
      reward_amount: rewardAmount,
      rate_percent: Number(position.rate_percent),
      duration_days: position.duration_days,
      starts_at: position.starts_at.toISOString(),
      ends_at: position.ends_at.toISOString(),
      claimed_at: position.claimed_at?.toISOString() ?? null,
      cancelled_at: position.cancelled_at?.toISOString() ?? null,
      created_at: createdAt.toISOString(),
      updated_at: updatedAt.toISOString(),
      can_claim: canClaim,
      can_unstake: canUnstake,
      progress_percent: calculateEarnVaultProgress(
        position.starts_at,
        position.ends_at,
        now,
      ),
      total_return: roundMoney(Number(position.amount) + rewardAmount),
    }
  }
}
