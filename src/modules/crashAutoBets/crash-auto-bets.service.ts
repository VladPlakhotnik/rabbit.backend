import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  CrashAutoBet,
  type CrashAutoBetRoundAction,
} from './entities/crash-auto-bet.entity'
import {
  CreateCrashAutoBetDto,
  UpdateCrashAutoBetDto,
} from './dto/crash-auto-bet.dto'

export interface PublicCrashAutoBet {
  id: number
  name: string
  enabled: boolean
  auto_cashout_multiplier: number
  initial_bet: number
  max_bet: number
  on_win_action: CrashAutoBetRoundAction
  on_loss_action: CrashAutoBetRoundAction
  on_max_bet_action: CrashAutoBetRoundAction
  created_at: Date
  updated_at: Date
}

@Injectable()
export class CrashAutoBetsService {
  constructor(
    @InjectRepository(CrashAutoBet)
    private readonly crashAutoBetsRepository: Repository<CrashAutoBet>,
  ) {}

  async getUserStrategies(userId: number): Promise<PublicCrashAutoBet[]> {
    const strategies = await this.crashAutoBetsRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC', id: 'DESC' },
    })

    return strategies.map(strategy => this.toPublicStrategy(strategy))
  }

  async createStrategy(
    userId: number,
    dto: CreateCrashAutoBetDto,
  ): Promise<PublicCrashAutoBet> {
    const name = this.normalizeName(dto.name)

    this.assertStakeRange(dto.initial_bet, dto.max_bet)

    const strategy = this.crashAutoBetsRepository.create({
      ...dto,
      user_id: userId,
      name,
      enabled: dto.enabled ?? true,
    })

    const savedStrategy = await this.crashAutoBetsRepository.save(strategy)

    return this.toPublicStrategy(savedStrategy)
  }

  async updateStrategy(
    userId: number,
    strategyId: number,
    dto: UpdateCrashAutoBetDto,
  ): Promise<PublicCrashAutoBet> {
    const strategy = await this.crashAutoBetsRepository.findOne({
      where: { id: strategyId, user_id: userId },
    })

    if (!strategy) {
      throw new NotFoundException('Crash auto bet strategy not found')
    }

    const nextInitialBet = dto.initial_bet ?? strategy.initial_bet
    const nextMaxBet = dto.max_bet ?? strategy.max_bet

    this.assertStakeRange(nextInitialBet, nextMaxBet)

    Object.assign(strategy, dto)

    if (dto.name !== undefined) {
      strategy.name = this.normalizeName(dto.name)
    }

    const savedStrategy = await this.crashAutoBetsRepository.save(strategy)

    return this.toPublicStrategy(savedStrategy)
  }

  async deleteStrategy(userId: number, strategyId: number): Promise<void> {
    const result = await this.crashAutoBetsRepository.delete({
      id: strategyId,
      user_id: userId,
    })

    if (!result.affected) {
      throw new NotFoundException('Crash auto bet strategy not found')
    }
  }

  private assertStakeRange(initialBet: number, maxBet: number): void {
    if (maxBet < initialBet) {
      throw new BadRequestException(
        'Maximum bet cannot be lower than initial bet',
      )
    }
  }

  private normalizeName(name: string): string {
    const normalizedName = name.trim()

    if (!normalizedName) {
      throw new BadRequestException('Strategy name cannot be empty')
    }

    return normalizedName
  }

  private toPublicStrategy(strategy: CrashAutoBet): PublicCrashAutoBet {
    return {
      id: strategy.id,
      name: strategy.name,
      enabled: strategy.enabled,
      auto_cashout_multiplier: strategy.auto_cashout_multiplier,
      initial_bet: strategy.initial_bet,
      max_bet: strategy.max_bet,
      on_win_action: strategy.on_win_action,
      on_loss_action: strategy.on_loss_action,
      on_max_bet_action: strategy.on_max_bet_action,
      created_at: strategy.created_at,
      updated_at: strategy.updated_at,
    }
  }
}
