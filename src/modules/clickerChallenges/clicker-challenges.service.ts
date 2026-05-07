import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Repository } from 'typeorm'
import { ClickerChallenge } from './entities/clicker_challenge.entity'
import { ClickerChallengeCondition } from './entities/clicker_challenge_condition.entity'
import {
  ClickerChallengeProgress,
  type ClickerChallengeProgressStatus,
} from './entities/clicker_challenge_progress.entity'
import { UpdateChallengeConditionDto } from './dto/update-challenge-condition.dto'
import { ClickerUser } from '../clickerUser/entities/clicker_user.entity'
import { ClickerUserService } from '../clickerUser/clicker-user.service'
import { ClickerFlushService } from '../clickerUser/redis/clicker-flush.service'
import { ClickerRedisService } from '../clickerUser/redis/clicker-redis.service'
import { ClickerLevelsCacheService } from '../clickerUser/services/clicker-levels-cache.service'
import { ClickerHistoryService } from '../clickerHistory/clicker-history.service'

type ChallengeGameType = 'csgo' | 'dota' | string

export type ClickerChallengeEvent =
  | {
      type: 'case_opened'
      caseId: number
      caseName: string
      gameType: ChallengeGameType
      count: number
      totalCost: number
    }
  | {
      type: 'skin_upgrade'
      gameType: ChallengeGameType
      mode: string
      cost: number
      chance: number
      success: boolean
    }
  | {
      type: 'telegram_linked'
      telegramUserId: number
    }

export interface ClickerChallengeForUser {
  id: number
  key: string | null
  name: string
  description: string
  points_reward: number
  action_url: string | null
  condition: {
    type: string
    target: number
    params: Record<string, unknown>
  }
  progress: {
    value: number
    target: number
    status: ClickerChallengeProgressStatus
    completed_at: Date | null
    claimed_at: Date | null
  }
}

export interface ClaimChallengeRewardResult {
  challenge_id: number
  reward: number
  points: number
  total_points: number
  level_id: number
}

@Injectable()
export class ClickerChallengesService {
  constructor(
    @InjectRepository(ClickerChallenge)
    private readonly challengeRepository: Repository<ClickerChallenge>,
    @InjectRepository(ClickerChallengeCondition)
    private readonly conditionRepository: Repository<ClickerChallengeCondition>,
    @InjectRepository(ClickerChallengeProgress)
    private readonly progressRepository: Repository<ClickerChallengeProgress>,
    private readonly dataSource: DataSource,
    private readonly clickerUserService: ClickerUserService,
    private readonly flushService: ClickerFlushService,
    private readonly redisService: ClickerRedisService,
    private readonly levelsCache: ClickerLevelsCacheService,
    private readonly historyService: ClickerHistoryService,
  ) {}

  findAll() {
    return this.challengeRepository.find({
      relations: ['condition'],
      order: { sort_order: 'ASC', id: 'ASC' },
    })
  }

  findById(id: number) {
    return this.challengeRepository.findOne({
      where: { id },
      relations: ['condition'],
    })
  }

  async findForUser(userId: number): Promise<ClickerChallengeForUser[]> {
    const challenges = await this.challengeRepository.find({
      where: { is_active: true },
      relations: ['condition'],
      order: { sort_order: 'ASC', id: 'ASC' },
    })

    if (challenges.length === 0) return []

    const progressRows = await this.progressRepository.find({
      where: {
        user_id: userId,
        challenge_id: In(challenges.map(challenge => challenge.id)),
      },
    })
    const byChallengeId = new Map(
      progressRows.map(row => [row.challenge_id, row]),
    )

    return challenges.map(challenge => {
      const condition = challenge.condition
      const target = Math.max(1, condition?.target ?? 1)
      const progress = byChallengeId.get(challenge.id)
      const value = Math.min(progress?.progress ?? 0, progress?.target ?? target)
      const status =
        progress?.status ??
        (value >= target ? 'completed' : 'in_progress')

      return {
        id: challenge.id,
        key: challenge.key,
        name: challenge.name,
        description: challenge.description,
        points_reward: challenge.points_reward,
        action_url: challenge.action_url,
        condition: {
          type: condition?.type ?? '',
          target,
          params: condition?.params ?? {},
        },
        progress: {
          value,
          target: progress?.target ?? target,
          status,
          completed_at: progress?.completed_at ?? null,
          claimed_at: progress?.claimed_at ?? null,
        },
      }
    })
  }

  create(data: Partial<ClickerChallenge>) {
    const challenge = this.challengeRepository.create(data)
    return this.challengeRepository.save(challenge)
  }

  update(id: number, data: Partial<ClickerChallenge>) {
    return this.challengeRepository.update(id, data as never)
  }

  remove(id: number) {
    return this.challengeRepository.delete(id)
  }

  async updateCondition(
    challengeId: number,
    conditionData: UpdateChallengeConditionDto,
  ) {
    const challenge = await this.findById(challengeId)
    if (!challenge) {
      throw new Error('Challenge not found')
    }

    if (!challenge.condition) {
      const newCondition = this.conditionRepository.create(conditionData)
      const savedCondition = await this.conditionRepository.save(newCondition)

      await this.challengeRepository.update(challengeId, {
        condition: { id: savedCondition.id } as never,
      })

      return this.findById(challengeId)
    }

    await this.conditionRepository.update(
      challenge.condition.id,
      conditionData as never,
    )
    return this.findById(challengeId)
  }

  async trackEvent(
    userId: number,
    event: ClickerChallengeEvent,
  ): Promise<void> {
    const challenges = await this.challengeRepository.find({
      where: { is_active: true },
      relations: ['condition'],
    })

    const matching = challenges.filter(challenge =>
      this.matchesEvent(challenge, event),
    )
    if (matching.length === 0) return

    await Promise.all(
      matching.map(challenge =>
        this.incrementProgress(userId, challenge, event),
      ),
    )
  }

  async claimReward(
    userId: number,
    challengeId: number,
  ): Promise<ClaimChallengeRewardResult> {
    const currentProgress = await this.progressRepository.findOne({
      where: { user_id: userId, challenge_id: challengeId },
      relations: ['challenge'],
    })

    if (!currentProgress || !currentProgress.challenge) {
      throw new BadRequestException('Challenge is not completed')
    }
    if (currentProgress.status === 'claimed') {
      throw new ConflictException('Challenge reward already claimed')
    }
    if (
      currentProgress.status !== 'completed' ||
      currentProgress.progress < currentProgress.target
    ) {
      throw new BadRequestException('Challenge is not completed')
    }

    await this.clickerUserService.findOrCreateByUserId(userId)
    await this.flushService.flushUser(userId)

    const result = await this.dataSource.transaction(async manager => {
      const progress = await manager
        .createQueryBuilder(ClickerChallengeProgress, 'progress')
        .innerJoinAndSelect('progress.challenge', 'challenge')
        .where('progress.user_id = :userId', { userId })
        .andWhere('progress.challenge_id = :challengeId', { challengeId })
        .setLock('pessimistic_write')
        .getOne()

      if (!progress || !progress.challenge) {
        throw new BadRequestException('Challenge is not completed')
      }
      if (progress.status === 'claimed') {
        throw new ConflictException('Challenge reward already claimed')
      }
      if (progress.status !== 'completed' || progress.progress < progress.target) {
        throw new BadRequestException('Challenge is not completed')
      }

      const user = await manager
        .createQueryBuilder(ClickerUser, 'cu')
        .where('cu.user_id = :userId', { userId })
        .setLock('pessimistic_write')
        .getOne()
      if (!user) {
        throw new NotFoundException('Clicker profile not found')
      }

      const userWithLevel = await manager.findOne(ClickerUser, {
        where: { user_id: userId },
        relations: ['level'],
      })
      const currentLevel = userWithLevel?.level ?? null
      const reward = Math.max(0, Math.trunc(progress.challenge.points_reward))
      const stateBefore = {
        points: user.points,
        total_points: user.total_points,
        level_id: currentLevel?.id ?? null,
      }

      user.points += reward
      user.total_points = (user.total_points ?? 0) + reward

      const levels = await this.levelsCache.getBunnyLevels()
      const currentLevelId = currentLevel?.id ?? 0
      let nextLevel = currentLevel
      for (const level of levels) {
        if (level.id < currentLevelId) continue
        if (user.total_points >= level.points_required) {
          nextLevel = level
        } else {
          break
        }
      }
      if (nextLevel) {
        user.level = nextLevel
      }
      user.last_energy_update = new Date()
      await manager.save(user)

      progress.status = 'claimed'
      progress.claimed_at = new Date()
      await manager.save(progress)

      return {
        challengeKey: progress.challenge.key,
        challengeName: progress.challenge.name,
        reward,
        points: user.points,
        total_points: user.total_points,
        level_id: user.level?.id ?? currentLevel?.id ?? 0,
        stateBefore,
        stateAfter: {
          points: user.points,
          total_points: user.total_points,
          level_id: user.level?.id ?? currentLevel?.id ?? null,
        },
      }
    })

    await this.redisService.clearUser(userId)

    await this.historyService.record({
      user_id: userId,
      action: 'challenge_reward_claim',
      payload: {
        challenge_id: challengeId,
        challenge_key: result.challengeKey,
        challenge_name: result.challengeName,
        reward: result.reward,
      },
      state_before: result.stateBefore,
      state_after: result.stateAfter,
      source: 'rest',
    })

    return {
      challenge_id: challengeId,
      reward: result.reward,
      points: result.points,
      total_points: result.total_points,
      level_id: result.level_id,
    }
  }

  private matchesEvent(
    challenge: ClickerChallenge,
    event: ClickerChallengeEvent,
  ): boolean {
    const condition = challenge.condition
    if (!condition || condition.type !== event.type) return false

    const params = condition.params ?? {}
    switch (event.type) {
      case 'case_opened':
        return (
          this.matchesOptionalString(params, 'gameType', event.gameType) &&
          this.meetsMinNumber(params, 'minTotalCost', event.totalCost)
        )
      case 'skin_upgrade':
        return (
          this.matchesOptionalString(params, 'gameType', event.gameType) &&
          this.meetsMinNumber(params, 'minCost', event.cost) &&
          this.meetsMaxNumberExclusive(
            params,
            'maxChancePctExclusive',
            event.chance,
          ) &&
          this.matchesOptionalBoolean(params, 'successOnly', event.success)
        )
      case 'telegram_linked':
        return true
      default:
        return false
    }
  }

  private async incrementProgress(
    userId: number,
    challenge: ClickerChallenge,
    event: ClickerChallengeEvent,
  ): Promise<void> {
    const target = Math.max(1, Math.trunc(challenge.condition?.target ?? 1))
    const increment = Math.min(
      target,
      Math.max(1, Math.trunc(this.eventIncrement(event))),
    )
    const payload = JSON.stringify({
      ...event,
      tracked_at: new Date().toISOString(),
    })

    await this.dataSource.query(
      `
        INSERT INTO clicker_challenge_progress (
          user_id,
          challenge_id,
          progress,
          target,
          status,
          completed_at,
          last_event_payload,
          created_at,
          updated_at
        )
        VALUES (
          $1::integer,
          $2::integer,
          $3::integer,
          $4::integer,
          CASE WHEN $3::integer >= $4::integer THEN 'completed' ELSE 'in_progress' END,
          CASE WHEN $3::integer >= $4::integer THEN now() ELSE NULL END,
          $5::jsonb,
          now(),
          now()
        )
        ON CONFLICT (user_id, challenge_id)
        DO UPDATE SET
          progress = CASE
            WHEN clicker_challenge_progress.status = 'claimed' THEN clicker_challenge_progress.progress
            ELSE LEAST(clicker_challenge_progress.target, clicker_challenge_progress.progress + EXCLUDED.progress)
          END,
          status = CASE
            WHEN clicker_challenge_progress.status = 'claimed' THEN clicker_challenge_progress.status
            WHEN LEAST(clicker_challenge_progress.target, clicker_challenge_progress.progress + EXCLUDED.progress) >= clicker_challenge_progress.target THEN 'completed'
            ELSE clicker_challenge_progress.status
          END,
          completed_at = CASE
            WHEN clicker_challenge_progress.completed_at IS NOT NULL THEN clicker_challenge_progress.completed_at
            WHEN clicker_challenge_progress.status = 'claimed' THEN clicker_challenge_progress.completed_at
            WHEN LEAST(clicker_challenge_progress.target, clicker_challenge_progress.progress + EXCLUDED.progress) >= clicker_challenge_progress.target THEN now()
            ELSE NULL
          END,
          last_event_payload = EXCLUDED.last_event_payload,
          updated_at = now()
        WHERE clicker_challenge_progress.status <> 'claimed'
      `,
      [userId, challenge.id, increment, target, payload],
    )
  }

  private eventIncrement(event: ClickerChallengeEvent): number {
    if (event.type === 'case_opened') return event.count
    return 1
  }

  private matchesOptionalString(
    params: Record<string, unknown>,
    key: string,
    actual: string,
  ): boolean {
    const expected = params[key]
    return typeof expected !== 'string' || expected === actual
  }

  private matchesOptionalBoolean(
    params: Record<string, unknown>,
    key: string,
    actual: boolean,
  ): boolean {
    const expected = params[key]
    return typeof expected !== 'boolean' || expected === actual
  }

  private meetsMinNumber(
    params: Record<string, unknown>,
    key: string,
    actual: number,
  ): boolean {
    const min = this.numberParam(params, key)
    return min == null || actual >= min
  }

  private meetsMaxNumberExclusive(
    params: Record<string, unknown>,
    key: string,
    actual: number,
  ): boolean {
    const max = this.numberParam(params, key)
    return max == null || actual < max
  }

  private numberParam(
    params: Record<string, unknown>,
    key: string,
  ): number | null {
    const value = params[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }
}
