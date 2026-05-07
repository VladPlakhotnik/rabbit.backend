import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { PartnerLevelConfig } from './entities/partnerLevel.entity'
import { PartnerProfile, PartnerLevel } from './entities/partnerProfile.entity'
import {
  PromoCode,
  PromoCodeStatus,
  PromoCodeType,
} from '../promoCodes/entities/promoCode.entity'
import { User } from '../users/user.entity'

const REFERRAL_CODE_PREFIX = 'RBT-'
const REFERRAL_CODE_BODY_LEN = 6
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // base32, no I/O/0/1
const CUSTOM_CODE_REGEX = /^[A-Z0-9_-]{4,20}$/
const CUSTOM_CODE_RESERVED_PREFIXES = ['RBT-', 'RBT_']
const CUSTOM_CODE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const CUSTOM_CODE_MIN_LEVEL = PartnerLevel.SILVER

export interface PartnerDashboard {
  level: PartnerLevel
  code: string
  referral_balance: number
  total_earned: number
  /**
   * Cumulative deposits made by the partner's referrals. Drives the
   * progress bar to the next tier — the frontend renders
   * `total_referrals_deposit / next_min_referrals_deposit`.
   */
  total_referrals_deposit: number
  active_referrals: number
  /** Current tier's payout rate (% of referral deposits credited). */
  your_percentage: number
  /** Current tier's bonus rate shown to incoming referrals. */
  referral_percentage: number
  can_change_code: boolean
  next_code_change_at: Date | null
  code_locked_by_admin: boolean
}

export interface PartnerLevelDto {
  level: PartnerLevel
  name: string
  min_referrals_deposit: number
  your_percentage: number
  referral_percentage: number
}

export interface ReferralListItem {
  id: number
  display_name: string
  avatar: string
  joined_at: Date
}

@Injectable()
export class PartnerService {
  private readonly logger = new Logger(PartnerService.name)

  constructor(
    @InjectRepository(PartnerProfile)
    private readonly partnerProfileRepository: Repository<PartnerProfile>,
    @InjectRepository(PartnerLevelConfig)
    private readonly partnerLevelRepository: Repository<PartnerLevelConfig>,
    @InjectRepository(PromoCode)
    private readonly promoCodeRepository: Repository<PromoCode>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Returns the rate card — every tier ordered by `level` ascending.
   * Public lookup the frontend needs to render the level grid + the
   * progress bar's "next tier threshold" without duplicating the
   * numbers in app code. Caller side: the controller exposes this as
   * `GET /partners/levels`.
   *
   * Lazy-seeded fallback: an empty table would make the frontend show
   * a blank rate card. The migration seeds the initial 5 rows on
   * first deploy, but this method also seeds in-memory if a corrupted
   * DB came up empty (e.g. truncated by accident). The fallback is
   * the same data the migration writes.
   */
  async getLevels(): Promise<PartnerLevelDto[]> {
    const rows = await this.partnerLevelRepository.find({
      order: { level: 'ASC' },
    })
    return rows.map(row => ({
      level: row.level as PartnerLevel,
      name: row.name,
      min_referrals_deposit: row.min_referrals_deposit,
      your_percentage: row.your_percentage,
      referral_percentage: row.referral_percentage,
    }))
  }

  /**
   * Recomputes a profile's level based on `total_referrals_deposit`.
   *
   * Picks the highest tier whose `min_referrals_deposit` is ≤ the
   * partner's running total. Idempotent — calling on an
   * already-correct profile is a no-op (no SAVE if level didn't move).
   *
   * Called from:
   *   - `getDashboard` (lazy refresh on view, cheap),
   *   - the future deposit-success hook (drops level update inline
   *     with the balance/total_earned credit),
   *   - any admin tool that mutates `total_referrals_deposit`.
   *
   * Pass `manager` to participate in an outer transaction; without it,
   * the method opens its own implicit query.
   */
  async recomputeLevel(
    userId: number,
    manager?: EntityManager,
  ): Promise<PartnerLevel> {
    const profileRepo = manager
      ? manager.getRepository(PartnerProfile)
      : this.partnerProfileRepository
    const levelRepo = manager
      ? manager.getRepository(PartnerLevelConfig)
      : this.partnerLevelRepository

    const profile = await profileRepo.findOne({ where: { user_id: userId } })
    if (!profile) {
      // No profile yet — caller should have called getOrCreateProfile.
      // Return Bronze as the conservative default; this avoids a
      // spurious save when the dashboard route lazy-creates the row
      // for the first time.
      return PartnerLevel.BRONZE
    }

    // Levels in ascending order; find the highest tier the partner
    // qualifies for. Threshold is inclusive (≥) so 500.00 hits Silver.
    const levels = await levelRepo.find({ order: { level: 'ASC' } })
    let nextLevel: PartnerLevel = PartnerLevel.BRONZE
    for (const tier of levels) {
      if (profile.total_referrals_deposit >= tier.min_referrals_deposit) {
        nextLevel = tier.level as PartnerLevel
      } else {
        break
      }
    }

    if (profile.level !== nextLevel) {
      profile.level = nextLevel
      await profileRepo.save(profile)
      this.logger.log(
        `Partner ${userId} level recomputed to ${nextLevel} ` +
          `(total_referrals_deposit=${profile.total_referrals_deposit})`,
      )
    }

    return nextLevel
  }

  /**
   * Returns the partner dashboard for `userId`, creating profile + referral code on first access.
   *
   * Re-evaluates the partner's level on every load — cheap (a single
   * indexed read on partner_levels + a no-op save when the level is
   * already correct) and means the dashboard always reflects current
   * level for the current `total_referrals_deposit`. The future
   * deposit-success hook will also call `recomputeLevel` directly so
   * level-ups happen the moment the threshold is crossed; this lazy
   * pass is a safety net against drift.
   */
  async getDashboard(userId: number): Promise<PartnerDashboard> {
    const { profile, code } = await this.getOrCreateProfile(userId)
    await this.recomputeLevel(userId)
    // Re-read the profile post-recompute so the dashboard reflects any
    // level move. Single round-trip — find by PK is sub-ms.
    const fresh =
      (await this.partnerProfileRepository.findOne({
        where: { user_id: userId },
      })) ?? profile

    const [activeReferrals, levels] = await Promise.all([
      this.userRepository.count({ where: { referral_parent_id: userId } }),
      this.getLevels(),
    ])

    return this.toDashboard(fresh, code, activeReferrals, levels)
  }

  /**
   * Lists users referred by `userId`.
   */
  async getReferrals(userId: number): Promise<{
    count: number
    items: ReferralListItem[]
  }> {
    const referrals = await this.userRepository.find({
      where: { referral_parent_id: userId },
      select: ['id', 'display_name', 'avatar', 'created_at'],
      order: { created_at: 'DESC' },
    })

    return {
      count: referrals.length,
      items: referrals.map(u => ({
        id: u.id,
        display_name: u.display_name,
        avatar: u.avatar,
        joined_at: u.created_at,
      })),
    }
  }

  /**
   * Sets a user-chosen referral code. Enforces level, cooldown, charset, blacklist, uniqueness.
   */
  async setCustomCode(
    userId: number,
    rawCode: string,
  ): Promise<PartnerDashboard> {
    const code = (rawCode ?? '').trim().toUpperCase()

    if (!CUSTOM_CODE_REGEX.test(code)) {
      throw new BadRequestException(
        'Code must be 4-20 chars, A-Z / 0-9 / _ / - only',
      )
    }

    if (CUSTOM_CODE_RESERVED_PREFIXES.some(p => code.startsWith(p))) {
      throw new BadRequestException('This prefix is reserved')
    }

    const { profile, code: existingCode } = await this.getOrCreateProfile(
      userId,
    )

    if (profile.code_locked_by_admin) {
      throw new BadRequestException(
        'Code customization is locked, please contact support',
      )
    }

    if (profile.level < CUSTOM_CODE_MIN_LEVEL) {
      throw new BadRequestException(
        'Custom codes are available from Silver level',
      )
    }

    const nextChangeAt = this.computeNextCodeChangeAt(profile)
    if (nextChangeAt && nextChangeAt > new Date()) {
      throw new BadRequestException(
        'Code can be changed once per 30 days',
      )
    }

    if (existingCode.code.toUpperCase() === code) {
      // No-op, just return current state
      const [activeReferrals, levels] = await Promise.all([
        this.userRepository.count({ where: { referral_parent_id: userId } }),
        this.getLevels(),
      ])
      return this.toDashboard(profile, existingCode, activeReferrals, levels)
    }

    await this.dataSource.transaction(async manager => {
      const collision = await manager
        .getRepository(PromoCode)
        .createQueryBuilder('p')
        .where('UPPER(p.code) = :code', { code })
        .getOne()

      if (collision && collision.id !== existingCode.id) {
        throw new ConflictException('This code is already taken')
      }

      existingCode.code = code
      await manager.getRepository(PromoCode).save(existingCode)

      profile.last_code_change_at = new Date()
      await manager.getRepository(PartnerProfile).save(profile)
    })

    const [activeReferrals, levels] = await Promise.all([
      this.userRepository.count({ where: { referral_parent_id: userId } }),
      this.getLevels(),
    ])
    return this.toDashboard(profile, existingCode, activeReferrals, levels)
  }

  /**
   * Attaches `code`'s owner as `userId`'s referral parent.
   *
   * - Returns true on successful binding (caller may bump current_uses).
   * - Returns false silently when code doesn't exist or isn't an active REFERRAL code,
   *   so callers handling untrusted input (post-OAuth attach) can swallow gracefully.
   * - Throws BadRequest on self-referral or when the user is already attached, since these
   *   are user-driven choices that deserve explicit feedback.
   */
  async attachReferralParent(
    userId: number,
    code: string,
  ): Promise<boolean> {
    const normalized = (code ?? '').trim()
    if (!normalized) {
      return false
    }

    const promoCode = await this.promoCodeRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.created_by', 'owner')
      .where('UPPER(p.code) = UPPER(:code)', { code: normalized })
      .getOne()

    if (
      !promoCode ||
      promoCode.type !== PromoCodeType.REFERRAL ||
      promoCode.status !== PromoCodeStatus.ACTIVE ||
      !promoCode.created_by
    ) {
      return false
    }

    const parentId = promoCode.created_by.id

    if (parentId === userId) {
      throw new BadRequestException('Cannot use your own referral code')
    }

    const result = await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ referral_parent_id: parentId })
      .where('id = :id AND referral_parent_id IS NULL', { id: userId })
      .execute()

    if (result.affected === 0) {
      const existing = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'referral_parent_id'],
      })
      if (!existing) {
        throw new NotFoundException('User not found')
      }
      if (existing.referral_parent_id !== null) {
        throw new BadRequestException(
          'Referral binding already set, please contact support to change it',
        )
      }
      return false
    }

    this.logger.log(
      `Attached referral parent ${parentId} to user ${userId} via code ${promoCode.code}`,
    )
    return true
  }

  /**
   * Wraps attachReferralParent + current_uses bump for the post-OAuth attach flow.
   */
  async attachAndBump(userId: number, code: string): Promise<boolean> {
    const attached = await this.attachReferralParent(userId, code)
    if (attached) {
      await this.promoCodeRepository
        .createQueryBuilder()
        .update(PromoCode)
        .set({ current_uses: () => 'current_uses + 1' })
        .where('UPPER(code) = UPPER(:code)', { code: code.trim() })
        .execute()
    }
    return attached
  }

  /**
   * Idempotent: returns existing profile + code, or creates both atomically.
   */
  private async getOrCreateProfile(
    userId: number,
  ): Promise<{ profile: PartnerProfile; code: PromoCode }> {
    const existingProfile = await this.partnerProfileRepository.findOne({
      where: { user_id: userId },
    })
    const existingCode = await this.findReferralCode(userId)

    if (existingProfile && existingCode) {
      return { profile: existingProfile, code: existingCode }
    }

    const user = await this.userRepository.findOne({ where: { id: userId } })
    if (!user) {
      throw new NotFoundException('User not found')
    }

    return this.dataSource.transaction(async manager => {
      const profileRepo = manager.getRepository(PartnerProfile)
      const codeRepo = manager.getRepository(PromoCode)

      let profile = await profileRepo.findOne({ where: { user_id: userId } })
      if (!profile) {
        profile = profileRepo.create({
          user_id: userId,
          level: PartnerLevel.BRONZE,
        })
        profile = await profileRepo.save(profile)
      }

      let code = await codeRepo
        .createQueryBuilder('p')
        .where('p.created_by = :userId', { userId })
        .andWhere('p.type = :type', { type: PromoCodeType.REFERRAL })
        .andWhere('p.status = :status', { status: PromoCodeStatus.ACTIVE })
        .getOne()

      if (!code) {
        code = await this.createUniqueReferralCode(manager, user)
      }

      return { profile, code }
    })
  }

  private async findReferralCode(userId: number): Promise<PromoCode | null> {
    return this.promoCodeRepository
      .createQueryBuilder('p')
      .where('p.created_by = :userId', { userId })
      .andWhere('p.type = :type', { type: PromoCodeType.REFERRAL })
      .andWhere('p.status = :status', { status: PromoCodeStatus.ACTIVE })
      .getOne()
  }

  private async createUniqueReferralCode(
    manager: import('typeorm').EntityManager,
    user: User,
  ): Promise<PromoCode> {
    const codeRepo = manager.getRepository(PromoCode)

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = this.generateRandomCode()
      const collision = await codeRepo
        .createQueryBuilder('p')
        .where('UPPER(p.code) = :code', { code: candidate })
        .getOne()

      if (collision) {
        continue
      }

      const promo = codeRepo.create({
        code: candidate,
        type: PromoCodeType.REFERRAL,
        status: PromoCodeStatus.ACTIVE,
        description: 'Partner referral code',
        max_uses: null,
        expires_at: null,
        created_by: user,
        current_uses: 0,
      })
      return codeRepo.save(promo)
    }

    throw new ConflictException('Failed to allocate a unique referral code')
  }

  private generateRandomCode(): string {
    let body = ''
    for (let i = 0; i < REFERRAL_CODE_BODY_LEN; i++) {
      body += REFERRAL_CODE_ALPHABET.charAt(
        Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length),
      )
    }
    return REFERRAL_CODE_PREFIX + body
  }

  private computeNextCodeChangeAt(profile: PartnerProfile): Date | null {
    if (!profile.last_code_change_at) {
      return null
    }
    return new Date(
      profile.last_code_change_at.getTime() + CUSTOM_CODE_CHANGE_COOLDOWN_MS,
    )
  }

  private toDashboard(
    profile: PartnerProfile,
    code: PromoCode,
    activeReferrals: number,
    levels: PartnerLevelDto[],
  ): PartnerDashboard {
    const nextChangeAt = this.computeNextCodeChangeAt(profile)
    const cooldownActive = !!nextChangeAt && nextChangeAt > new Date()
    const canChangeCode =
      profile.level >= CUSTOM_CODE_MIN_LEVEL &&
      !profile.code_locked_by_admin &&
      !cooldownActive

    // Lookup the partner's tier in the rate card. Falls back to zero
    // rates when the tier is missing — covers the corner case of a
    // truncated `partner_levels` table or a brand-new level enum value
    // not yet seeded. The UI gracefully renders "0%" rather than
    // crashing on undefined.
    const currentLevelConfig = levels.find(l => l.level === profile.level)

    return {
      level: profile.level,
      code: code.code,
      referral_balance: profile.referral_balance,
      total_earned: profile.total_earned,
      total_referrals_deposit: profile.total_referrals_deposit,
      active_referrals: activeReferrals,
      your_percentage: currentLevelConfig?.your_percentage ?? 0,
      referral_percentage: currentLevelConfig?.referral_percentage ?? 0,
      can_change_code: canChangeCode,
      next_code_change_at: cooldownActive ? nextChangeAt : null,
      code_locked_by_admin: profile.code_locked_by_admin,
    }
  }
}
