import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { createHash, randomBytes } from 'crypto'
import axios from 'axios'
import {
  buildPaginatedResponse,
  normalizePagination,
  type PaginatedResponse,
} from '../../common/pagination'
import { PartnerLevelConfig } from './entities/partnerLevel.entity'
import { PartnerProfile, PartnerLevel } from './entities/partnerProfile.entity'
import { PartnerCpmDailyStat } from './entities/partnerCpmDailyStat.entity'
import { PartnerCampaign, PartnerCampaignStatus } from './entities/partnerCampaign.entity'
import { PartnerCampaignDailyStat } from './entities/partnerCampaignDailyStat.entity'
import {
  PartnerCommissionLedger,
  PartnerLedgerStatus,
  PartnerLedgerType,
} from './entities/partnerCommissionLedger.entity'
import { PartnerPostbackSetting } from './entities/partnerPostbackSetting.entity'
import {
  PromoCode,
  PromoCodeStatus,
  PromoCodeType,
} from '../promoCodes/entities/promoCode.entity'
import { User } from '../users/user.entity'
import type {
  AdminPartnerListQueryDto,
  AdminUpdatePartnerLevelDto,
  AdminUpdatePartnerProfileDto,
} from './dto/admin-partner.dto'
import {
  buildPartnerPostbackPayload,
  isResolvedPartnerPostbackUrlSafe,
  type PartnerPostbackEventType,
  type PartnerPostbackPayload,
  signPartnerPostbackPayload,
} from './partner-postback.utils'

const REFERRAL_CODE_PREFIX = 'RBT-'
const REFERRAL_CODE_BODY_LEN = 6
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // base32, no I/O/0/1
const CUSTOM_CODE_REGEX = /^[A-Z0-9_-]{4,20}$/
const CUSTOM_CODE_RESERVED_PREFIXES = ['RBT-', 'RBT_']
const CUSTOM_CODE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const CUSTOM_CODE_MIN_LEVEL = PartnerLevel.SILVER
const DEFAULT_STATS_PERIOD_DAYS = 30
const MAX_STATS_PERIOD_DAYS = 90
const CPM_SOURCE_REGEX = /^[A-Z0-9_-]{1,64}$/i
const TRACKABLE_REFERRAL_CODE_REGEX = /^[A-Z0-9_-]{4,64}$/i
const CAMPAIGN_NAME_REGEX = /^[\p{L}\p{N}\s_.-]{2,64}$/u
const CAMPAIGN_SLUG_REGEX = /^[A-Z0-9_-]{2,64}$/i
const LANDING_PATH_REGEX = /^\/[A-Z0-9/_-]{0,120}$/i
const DEFAULT_CAMPAIGN_SLUG = 'main'
const DEFAULT_CAMPAIGN_NAME = 'Main campaign'

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

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
  /** Current tier's RevShare rate (% of eligible NGR credited). */
  your_percentage: number
  /** Current tier's bonus rate shown to incoming referrals. */
  referral_percentage: number
  /** Current tier's CPM rate per 1,000 qualified unique visits. */
  cpm_rate: number
  traffic_impressions_30d: number
  traffic_unique_30d: number
  traffic_payable_30d: number
  cpm_estimated_30d: number
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
  cpm_rate: number
}

export interface ReferralListItem {
  id: number
  display_name: string
  avatar: string
  joined_at: Date
  status: PartnerReferralStatus
  campaign_id: number | null
  deposit_amount: number
}

export type PartnerReferralStatus = 'registered' | 'unconverted' | 'active'

export interface PartnerReferralDepositInput {
  amount: number
  depositId: number
  firstDeposit: boolean
  referralUser: Pick<
    User,
    | 'display_name'
    | 'id'
    | 'referral_campaign_id'
    | 'referral_parent_id'
    | 'referral_source'
    | 'referral_sub_id'
  >
  source: string
}

export interface PartnerReferralDepositPostback {
  data: Record<string, unknown>
  partnerUserId: number
}

export interface PartnerStatisticsPoint {
  date: string
  registrations: number
  referral_deposit_amount: number
  impressions: number
  unique_impressions: number
  payable_impressions: number
  cpm_estimated_amount: number
}

export interface PartnerStatistics {
  period_days: number
  totals: {
    registrations: number
    referral_deposit_amount: number
    impressions: number
    unique_impressions: number
    payable_impressions: number
    cpm_estimated_amount: number
  }
  series: PartnerStatisticsPoint[]
  breakdown: {
    campaigns: PartnerStatisticsBreakdownItem[]
    sources: PartnerStatisticsBreakdownItem[]
  }
}

export interface PartnerStatisticsBreakdownItem {
  id: string
  name: string
  campaign_id: number | null
  campaign_slug: string | null
  source: string | null
  sub_id: string | null
  impressions: number
  unique_impressions: number
  payable_impressions: number
  registrations: number
  active_referrals: number
  referral_deposit_amount: number
  cpm_estimated_amount: number
}

export interface TrackReferralImpressionInput {
  code: string
  ip: string
  userAgent: string
  source?: string | null
  campaign?: string | null
  subId?: string | null
}

export interface AttachReferralInput {
  code: string
  campaign?: string | null
  source?: string | null
  subId?: string | null
}

export interface PartnerCampaignDto {
  id: number
  name: string
  slug: string
  landing_path: string
  source: string | null
  sub_id: string | null
  status: PartnerCampaignStatus
  created_at: Date
  stats_30d: {
    impressions: number
    unique_impressions: number
    payable_impressions: number
    registrations: number
    referral_deposit_amount: number
    cpm_estimated_amount: number
  }
}

export interface UpsertPartnerCampaignInput {
  name?: string
  slug?: string
  landing_path?: string
  source?: string | null
  sub_id?: string | null
  status?: PartnerCampaignStatus
}

export interface PartnerLedgerDto {
  id: number
  type: PartnerLedgerType
  status: PartnerLedgerStatus
  amount: number
  reference: string | null
  description: string | null
  campaign_id: number | null
  created_at: Date
}

export interface PartnerSettingsDto {
  postback_enabled: boolean
  postback_url: string | null
  postback_secret: string
  postback_supported_events: PartnerPostbackEventType[]
}

export interface PartnerPostbackDeliveryDto {
  id: number | null
  event_type: PartnerPostbackEventType
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  target_url: string | null
  http_status: number | null
  error: string | null
  attempts: number
  created_at: Date
}

export interface AdminPartnerUserDto {
  id: number
  display_name: string
  avatar: string | null
  role: string
}

export interface AdminPartnerItem {
  id: number
  user_id: number
  user: AdminPartnerUserDto
  level: PartnerLevel
  level_name: string
  referral_code: string | null
  referral_balance: number
  total_earned: number
  total_referrals_deposit: number
  active_referrals: number
  referral_deposit_amount: number
  campaign_count: number
  postback_enabled: boolean
  code_locked_by_admin: boolean
  last_code_change_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface AdminPartnerOverview {
  total_partners: number
  locked_codes: number
  postback_enabled: number
  active_campaigns: number
  referral_balance_total: number
  total_earned: number
  total_referrals_deposit: number
  active_referrals: number
  referral_deposit_amount: number
  ledger: {
    pending_amount: number
    approved_amount: number
    paid_amount: number
  }
  traffic_30d: {
    impressions: number
    unique_impressions: number
    payable_impressions: number
    cpm_estimated_amount: number
  }
  levels: PartnerLevelDto[]
}

export interface AdminPartnerDetail extends AdminPartnerItem {
  referrals: {
    count: number
    items: ReferralListItem[]
  }
  campaigns: PartnerCampaignDto[]
  ledger: {
    available: number
    pending: number
    min_payout: number
    items: PartnerLedgerDto[]
  }
  settings: {
    postback_enabled: boolean
    postback_url: string | null
  }
  postbacks: PartnerPostbackDeliveryDto[]
}

interface AdminPartnerMaps {
  codes: Map<number, string>
  referrals: Map<
    number,
    { active_referrals: number; referral_deposit_amount: number }
  >
  campaigns: Map<number, number>
  postbacks: Map<number, boolean>
}

@Injectable()
export class PartnerService {
  private readonly logger = new Logger(PartnerService.name)

  constructor(
    @InjectRepository(PartnerProfile)
    private readonly partnerProfileRepository: Repository<PartnerProfile>,
    @InjectRepository(PartnerLevelConfig)
    private readonly partnerLevelRepository: Repository<PartnerLevelConfig>,
    @InjectRepository(PartnerCpmDailyStat)
    private readonly partnerCpmDailyStatRepository: Repository<PartnerCpmDailyStat>,
    @InjectRepository(PartnerCampaign)
    private readonly partnerCampaignRepository: Repository<PartnerCampaign>,
    @InjectRepository(PartnerCampaignDailyStat)
    private readonly partnerCampaignDailyStatRepository: Repository<PartnerCampaignDailyStat>,
    @InjectRepository(PartnerCommissionLedger)
    private readonly partnerCommissionLedgerRepository: Repository<PartnerCommissionLedger>,
    @InjectRepository(PartnerPostbackSetting)
    private readonly partnerPostbackSettingRepository: Repository<PartnerPostbackSetting>,
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
      cpm_rate: row.cpm_rate,
    }))
  }

  async getAdminOverview(): Promise<AdminPartnerOverview> {
    const startDateSql = this.formatSqlDate(
      this.getUtcDayOffset(-(DEFAULT_STATS_PERIOD_DAYS - 1)),
    )

    const [
      levels,
      postbackEnabled,
      activeCampaigns,
      profileRows,
      referralRows,
      ledgerRows,
      trafficRows,
    ] = await Promise.all([
      this.getLevels(),
      this.partnerPostbackSettingRepository.count({
        where: { enabled: true },
      }),
      this.partnerCampaignRepository.count({
        where: { status: PartnerCampaignStatus.ACTIVE },
      }),
      this.dataSource.query(`
        SELECT
          COUNT(*)::int AS total_partners,
          COUNT(*) FILTER (WHERE "code_locked_by_admin")::int AS locked_codes,
          COALESCE(SUM("referral_balance"), 0)::numeric AS referral_balance_total,
          COALESCE(SUM("total_earned"), 0)::numeric AS total_earned,
          COALESCE(SUM("total_referrals_deposit"), 0)::numeric AS total_referrals_deposit
        FROM "partner_profiles"
      `),
      this.dataSource.query(`
        SELECT
          COUNT(*) FILTER (WHERE COALESCE("deposit_amount", 0) > 0)::int AS active_referrals,
          COALESCE(SUM("deposit_amount"), 0)::numeric AS referral_deposit_amount
        FROM "users"
        WHERE "referral_parent_id" IS NOT NULL
      `),
      this.dataSource.query(`
        SELECT
          COALESCE(SUM("amount") FILTER (WHERE "status" = '${PartnerLedgerStatus.PENDING}'), 0)::numeric AS pending_amount,
          COALESCE(SUM("amount") FILTER (WHERE "status" = '${PartnerLedgerStatus.APPROVED}'), 0)::numeric AS approved_amount,
          COALESCE(SUM("amount") FILTER (WHERE "status" = '${PartnerLedgerStatus.PAID}'), 0)::numeric AS paid_amount
        FROM "partner_commission_ledger"
      `),
      this.dataSource.query(
        `
          SELECT
            COALESCE(SUM("impressions"), 0)::int AS impressions,
            COALESCE(SUM("unique_impressions"), 0)::int AS unique_impressions,
            COALESCE(SUM("payable_impressions"), 0)::int AS payable_impressions,
            COALESCE(SUM("estimated_amount"), 0)::numeric AS cpm_estimated_amount
          FROM "partner_cpm_daily_stats"
          WHERE "day" >= $1::date
        `,
        [startDateSql],
      ),
    ])

    const profile = profileRows[0] ?? {}
    const referrals = referralRows[0] ?? {}
    const ledger = ledgerRows[0] ?? {}
    const traffic = trafficRows[0] ?? {}

    return {
      total_partners: Number(profile.total_partners) || 0,
      locked_codes: Number(profile.locked_codes) || 0,
      postback_enabled: Number(postbackEnabled) || 0,
      active_campaigns: Number(activeCampaigns) || 0,
      referral_balance_total: Number(profile.referral_balance_total) || 0,
      total_earned: Number(profile.total_earned) || 0,
      total_referrals_deposit: Number(profile.total_referrals_deposit) || 0,
      active_referrals: Number(referrals.active_referrals) || 0,
      referral_deposit_amount:
        Number(referrals.referral_deposit_amount) || 0,
      ledger: {
        pending_amount: Number(ledger.pending_amount) || 0,
        approved_amount: Number(ledger.approved_amount) || 0,
        paid_amount: Number(ledger.paid_amount) || 0,
      },
      traffic_30d: {
        impressions: Number(traffic.impressions) || 0,
        unique_impressions: Number(traffic.unique_impressions) || 0,
        payable_impressions: Number(traffic.payable_impressions) || 0,
        cpm_estimated_amount: Number(traffic.cpm_estimated_amount) || 0,
      },
      levels,
    }
  }

  async findAllForAdmin(
    query: AdminPartnerListQueryDto = {},
  ): Promise<PaginatedResponse<AdminPartnerItem>> {
    const pagination = normalizePagination({
      page: query.page,
      limit: query.limit,
    })

    const qb = this.partnerProfileRepository
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user')
      .leftJoin(
        PromoCode,
        'promo',
        [
          'promo.created_by = profile.user_id',
          'promo.type = :referralType',
          'promo.status = :referralStatus',
        ].join(' AND '),
        {
          referralStatus: PromoCodeStatus.ACTIVE,
          referralType: PromoCodeType.REFERRAL,
        },
      )

    if (query.level !== undefined) {
      qb.where('profile.level = :level', { level: query.level })
    }

    if (query.userId !== undefined) {
      qb.andWhere('profile.user_id = :userId', { userId: query.userId })
    }

    if (query.codeLocked !== undefined) {
      qb.andWhere('profile.code_locked_by_admin = :codeLocked', {
        codeLocked: query.codeLocked,
      })
    }

    if (query.minBalance !== undefined) {
      qb.andWhere('profile.referral_balance >= :minBalance', {
        minBalance: query.minBalance,
      })
    }

    if (query.maxBalance !== undefined) {
      qb.andWhere('profile.referral_balance <= :maxBalance', {
        maxBalance: query.maxBalance,
      })
    }

    const search = query.search?.trim()
    if (search) {
      qb.andWhere(
        [
          '(',
          'CAST(profile.user_id AS TEXT) ILIKE :search',
          'OR COALESCE(user.display_name, \'\') ILIKE :search',
          'OR COALESCE(promo.code, \'\') ILIKE :search',
          ')',
        ].join(' '),
        { search: `%${search}%` },
      )
    }

    qb.orderBy('profile.created_at', 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit)

    const [profiles, total] = await qb.getManyAndCount()
    const userIds = profiles.map(profile => profile.user_id)
    const [adminMaps, levels] = await Promise.all([
      this.loadAdminPartnerMaps(userIds),
      this.getLevels(),
    ])
    const levelMap = new Map(levels.map(level => [level.level, level.name]))
    const items = profiles.map(profile =>
      this.toAdminPartnerItem(profile, adminMaps, levelMap),
    )

    return buildPaginatedResponse(items, total, pagination)
  }

  async findAdminByUserId(userId: number): Promise<AdminPartnerDetail> {
    const profile = await this.partnerProfileRepository.findOne({
      where: { user_id: userId },
      relations: ['user'],
    })
    if (!profile) {
      throw new NotFoundException('Partner profile not found')
    }

    const [adminMaps, levels, referrals, campaigns, ledger, setting, postbacks] =
      await Promise.all([
        this.loadAdminPartnerMaps([userId]),
        this.getLevels(),
        this.getReferrals(userId),
        this.getAdminCampaigns(userId),
        this.getAdminLedger(userId),
        this.partnerPostbackSettingRepository.findOne({
          where: { user_id: userId },
        }),
        this.getPostbackDeliveries(userId),
      ])
    const levelMap = new Map(levels.map(level => [level.level, level.name]))

    return {
      ...this.toAdminPartnerItem(profile, adminMaps, levelMap),
      campaigns,
      ledger,
      postbacks,
      referrals,
      settings: {
        postback_enabled: setting?.enabled ?? false,
        postback_url: setting?.postback_url ?? null,
      },
    }
  }

  async updateProfileForAdmin(
    userId: number,
    input: AdminUpdatePartnerProfileDto,
  ): Promise<AdminPartnerDetail> {
    const profile = await this.partnerProfileRepository.findOne({
      where: { user_id: userId },
    })
    if (!profile) {
      throw new NotFoundException('Partner profile not found')
    }

    if (input.code_locked_by_admin !== undefined) {
      profile.code_locked_by_admin = input.code_locked_by_admin
    }

    if (input.level !== undefined) {
      profile.level = input.level
    }

    await this.partnerProfileRepository.save(profile)

    if (input.recompute_level) {
      await this.recomputeLevel(userId)
    }

    return this.findAdminByUserId(userId)
  }

  async updateLevelForAdmin(
    level: number,
    input: AdminUpdatePartnerLevelDto,
  ): Promise<PartnerLevelDto> {
    if (
      !Number.isInteger(level) ||
      level < PartnerLevel.BRONZE ||
      level > PartnerLevel.DIAMOND
    ) {
      throw new BadRequestException('Invalid partner level')
    }

    const row = await this.partnerLevelRepository.findOne({
      where: { level },
    })
    if (!row) {
      throw new NotFoundException('Partner level not found')
    }

    if (input.min_referrals_deposit !== undefined) {
      row.min_referrals_deposit = input.min_referrals_deposit
    }
    if (input.your_percentage !== undefined) {
      row.your_percentage = input.your_percentage
    }
    if (input.referral_percentage !== undefined) {
      row.referral_percentage = input.referral_percentage
    }
    if (input.cpm_rate !== undefined) {
      row.cpm_rate = input.cpm_rate
    }

    const saved = await this.partnerLevelRepository.save(row)
    return this.toLevelDto(saved)
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

  async recordReferralDeposit(
    manager: EntityManager,
    input: PartnerReferralDepositInput,
  ): Promise<PartnerReferralDepositPostback | null> {
    const partnerUserId = input.referralUser.referral_parent_id
    const amount = roundMoney(input.amount)

    if (
      !partnerUserId ||
      partnerUserId === input.referralUser.id ||
      amount <= 0
    ) {
      return null
    }

    const profileRows = await manager.query<
      { total_referrals_deposit: string | number }[]
    >(
      `
        INSERT INTO "partner_profiles"
          (
            "user_id",
            "level",
            "referral_balance",
            "total_earned",
            "total_referrals_deposit",
            "last_code_change_at",
            "code_locked_by_admin",
            "created_at",
            "updated_at"
          )
        VALUES ($1, $2, 0, 0, $3, NULL, false, NOW(), NOW())
        ON CONFLICT ("user_id")
        DO UPDATE SET
          "total_referrals_deposit" =
            ROUND(("partner_profiles"."total_referrals_deposit" + EXCLUDED."total_referrals_deposit")::numeric, 2),
          "updated_at" = NOW()
        RETURNING "total_referrals_deposit"
      `,
      [partnerUserId, PartnerLevel.BRONZE, amount],
    )

    await this.incrementCampaignReferralDeposit(
      manager,
      input,
      partnerUserId,
      amount,
    )
    await this.recomputeLevel(partnerUserId, manager)

    if (!input.firstDeposit) {
      return null
    }

    return {
      data: {
        amount,
        campaign_id: input.referralUser.referral_campaign_id ?? null,
        deposit_id: input.depositId,
        referral_display_name: input.referralUser.display_name,
        referral_source: input.referralUser.referral_source ?? null,
        referral_sub_id: input.referralUser.referral_sub_id ?? null,
        referral_user_id: input.referralUser.id,
        source: input.source,
        total_referrals_deposit:
          Number(profileRows[0]?.total_referrals_deposit) || amount,
      },
      partnerUserId,
    }
  }

  async dispatchReferralFirstDepositPostback(
    postback: PartnerReferralDepositPostback,
  ): Promise<void> {
    await this.dispatchPartnerPostback(
      postback.partnerUserId,
      'first_deposit',
      postback.data,
    )
  }

  /**
   * Returns the partner dashboard for `userId`, creating profile + referral code on first access.
   *
   * Re-evaluates the partner's level on every load — cheap (a single
   * indexed read on partner_levels + a no-op save when the level is
   * already correct) and means the dashboard always reflects current
   * level for the current `total_referrals_deposit`. The future
   * deposit-success hook also calls `recomputeLevel` directly so level-ups
   * happen the moment the threshold is crossed; this lazy pass is a safety
   * net against drift.
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

    const [activeReferrals, levels, cpmStats] = await Promise.all([
      this.userRepository.count({ where: { referral_parent_id: userId } }),
      this.getLevels(),
      this.getCpmTotalsForPeriod(userId, DEFAULT_STATS_PERIOD_DAYS),
    ])

    return this.toDashboard(fresh, code, activeReferrals, levels, cpmStats)
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
      select: [
        'id',
        'display_name',
        'avatar',
        'created_at',
        'deposit_amount',
        'referral_campaign_id',
      ],
      order: { created_at: 'DESC' },
    })

    return {
      count: referrals.length,
      items: referrals.map(u => ({
        id: u.id,
        display_name: u.display_name,
        avatar: u.avatar,
        joined_at: u.created_at,
        status: this.getReferralStatus(u),
        campaign_id: u.referral_campaign_id ?? null,
        deposit_amount: u.deposit_amount ?? 0,
      })),
    }
  }

  async getCampaigns(userId: number): Promise<PartnerCampaignDto[]> {
    await this.getOrCreateProfile(userId)
    await this.ensureDefaultCampaign(userId)

    const campaigns = await this.partnerCampaignRepository.find({
      where: { user_id: userId },
      order: { created_at: 'ASC' },
    })
    const stats = await this.getCampaignStatsMap(userId, DEFAULT_STATS_PERIOD_DAYS)

    return campaigns.map(campaign =>
      this.toCampaignDto(
        campaign,
        stats.get(campaign.id) ?? this.emptyCampaignStats(),
      ),
    )
  }

  async createCampaign(
    userId: number,
    input: UpsertPartnerCampaignInput,
  ): Promise<PartnerCampaignDto> {
    await this.getOrCreateProfile(userId)
    const data = this.normalizeCampaignInput(input, true)

    const campaign = this.partnerCampaignRepository.create({
      user_id: userId,
      name: data.name,
      slug: data.slug,
      landing_path: data.landing_path,
      source: data.source,
      sub_id: data.sub_id,
      status: data.status ?? PartnerCampaignStatus.ACTIVE,
    })

    try {
      const saved = await this.partnerCampaignRepository.save(campaign)
      return this.toCampaignDto(saved, this.emptyCampaignStats())
    } catch {
      throw new ConflictException('Campaign slug is already taken')
    }
  }

  async updateCampaign(
    userId: number,
    campaignId: number,
    input: UpsertPartnerCampaignInput,
  ): Promise<PartnerCampaignDto> {
    const campaign = await this.partnerCampaignRepository.findOne({
      where: { id: campaignId, user_id: userId },
    })
    if (!campaign) {
      throw new NotFoundException('Campaign not found')
    }

    const data = this.normalizeCampaignInput(input, false)
    Object.assign(campaign, data)

    try {
      const saved = await this.partnerCampaignRepository.save(campaign)
      const stats = await this.getCampaignStatsMap(
        userId,
        DEFAULT_STATS_PERIOD_DAYS,
      )
      return this.toCampaignDto(
        saved,
        stats.get(saved.id) ?? this.emptyCampaignStats(),
      )
    } catch {
      throw new ConflictException('Campaign slug is already taken')
    }
  }

  async deleteCampaign(
    userId: number,
    campaignId: number,
  ): Promise<{ deleted: true }> {
    const campaign = await this.partnerCampaignRepository.findOne({
      where: { id: campaignId, user_id: userId },
    })
    if (!campaign) {
      throw new NotFoundException('Campaign not found')
    }
    if (campaign.slug === DEFAULT_CAMPAIGN_SLUG) {
      throw new BadRequestException('Default campaign cannot be deleted')
    }

    const [statRows, referralRows, ledgerRows] = await Promise.all([
      this.partnerCampaignDailyStatRepository.count({
        where: { partner_user_id: userId, campaign_id: campaignId },
      }),
      this.userRepository.count({
        where: { referral_parent_id: userId, referral_campaign_id: campaignId },
      }),
      this.partnerCommissionLedgerRepository.count({
        where: { partner_user_id: userId, campaign_id: campaignId },
      }),
    ])

    if (statRows > 0 || referralRows > 0 || ledgerRows > 0) {
      throw new BadRequestException(
        'Campaign already has activity. Pause it instead.',
      )
    }

    await this.partnerCampaignRepository.delete({ id: campaignId, user_id: userId })
    return { deleted: true }
  }

  async getLedger(userId: number): Promise<{
    available: number
    pending: number
    min_payout: number
    items: PartnerLedgerDto[]
  }> {
    await this.getOrCreateProfile(userId)

    const [profile, ledgerRows] = await Promise.all([
      this.partnerProfileRepository.findOne({ where: { user_id: userId } }),
      this.partnerCommissionLedgerRepository.find({
        where: { partner_user_id: userId },
        order: { created_at: 'DESC' },
        take: 50,
      }),
    ])
    const pending = ledgerRows
      .filter(row => row.status === PartnerLedgerStatus.PENDING)
      .reduce((sum, row) => sum + row.amount, 0)

    return {
      available: profile?.referral_balance ?? 0,
      pending,
      min_payout: 10,
      items: ledgerRows.map(row => ({
        id: row.id,
        type: row.type,
        status: row.status,
        amount: row.amount,
        reference: row.reference,
        description: row.description,
        campaign_id: row.campaign_id,
        created_at: row.created_at,
      })),
    }
  }

  async getSettings(userId: number): Promise<PartnerSettingsDto> {
    const row = await this.getOrCreatePostbackSetting(userId)

    return {
      postback_enabled: row.enabled,
      postback_url: row.postback_url,
      postback_secret: row.secret,
      postback_supported_events: this.getSupportedPostbackEvents(),
    }
  }

  async updateSettings(
    userId: number,
    input: { postback_enabled?: boolean; postback_url?: string | null },
  ): Promise<PartnerSettingsDto> {
    const row = await this.getOrCreatePostbackSetting(userId)
    const url = (input.postback_url ?? '').trim()

    if (url && !(await this.isSafePostbackUrl(url))) {
      throw new BadRequestException('Postback URL must be a public HTTPS URL')
    }

    row.enabled = Boolean(input.postback_enabled && url)
    row.postback_url = url || null
    const saved = await this.partnerPostbackSettingRepository.save(row)

    return {
      postback_enabled: saved.enabled,
      postback_url: saved.postback_url,
      postback_secret: saved.secret,
      postback_supported_events: this.getSupportedPostbackEvents(),
    }
  }

  async getPostbackDeliveries(
    userId: number,
  ): Promise<PartnerPostbackDeliveryDto[]> {
    try {
      const rows = await this.dataSource.query(
        `
          SELECT
            "id",
            "event_type",
            "status",
            "target_url",
            "http_status",
            "error",
            "attempts",
            "created_at"
          FROM "partner_postback_delivery_logs"
          WHERE "partner_user_id" = $1
          ORDER BY "created_at" DESC
          LIMIT 20
        `,
        [userId],
      )

      return rows.map((row: {
        id: number | string
        event_type: PartnerPostbackEventType
        status: PartnerPostbackDeliveryDto['status']
        target_url: string | null
        http_status: number | string | null
        error: string | null
        attempts: number | string
        created_at: Date
      }) => ({
        id: Number(row.id),
        event_type: row.event_type,
        status: row.status,
        target_url: row.target_url,
        http_status: row.http_status === null ? null : Number(row.http_status),
        error: row.error,
        attempts: Number(row.attempts) || 0,
        created_at: row.created_at,
      }))
    } catch (error) {
      this.logger.warn(
        `Postback delivery log table is not available yet: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      )
      return []
    }
  }

  async sendTestPostback(userId: number): Promise<PartnerPostbackDeliveryDto> {
    const row = await this.getOrCreatePostbackSetting(userId)
    if (!row.enabled || !row.postback_url) {
      throw new BadRequestException('Enable a postback URL before testing')
    }

    return this.deliverPartnerPostback(userId, row, 'test', {
      message: 'Bunny postback test event',
    })
  }

  async getStatistics(
    userId: number,
    rawPeriodDays?: number,
    campaignId?: number,
  ): Promise<PartnerStatistics> {
    const periodDays = this.normalizeStatsPeriod(rawPeriodDays)
    const startDate = this.getUtcDayOffset(-(periodDays - 1))
    const startDateSql = this.formatSqlDate(startDate)
    const campaignFilter =
      campaignId && campaignId > 0 ? 'AND "referral_campaign_id" = $3' : ''
    const statRepo = campaignId
      ? this.partnerCampaignDailyStatRepository
      : this.partnerCpmDailyStatRepository
    const cpmWhere = campaignId
      ? `WHERE "partner_user_id" = $1 AND "campaign_id" = $3 AND "day" >= $2::date`
      : `WHERE "partner_user_id" = $1 AND "day" >= $2::date`
    const queryParams = campaignId
      ? [userId, startDateSql, campaignId]
      : [userId, startDateSql]

    const [registrationRows, depositRows, cpmRows] = await Promise.all([
      this.userRepository.query(
        `
          SELECT to_char(date_trunc('day', "created_at"), 'YYYY-MM-DD') AS day,
                 COUNT(*)::int AS registrations
          FROM "users"
          WHERE "referral_parent_id" = $1
            AND "created_at" >= $2::date
            ${campaignFilter}
          GROUP BY 1
        `,
        queryParams,
      ),
      this.userRepository.query(
        `
          SELECT to_char(date_trunc('day', "created_at"), 'YYYY-MM-DD') AS day,
                 COALESCE(SUM("deposit_amount"), 0)::numeric AS referral_deposit_amount
          FROM "users"
          WHERE "referral_parent_id" = $1
            AND "created_at" >= $2::date
            ${campaignFilter}
          GROUP BY 1
        `,
        queryParams,
      ),
      statRepo.query(
        `
          SELECT "day"::text AS day,
                 COALESCE(SUM("impressions"), 0)::int AS impressions,
                 COALESCE(SUM("unique_impressions"), 0)::int AS unique_impressions,
                 COALESCE(SUM("payable_impressions"), 0)::int AS payable_impressions,
                 COALESCE(SUM("${
                   campaignId ? 'cpm_estimated_amount' : 'estimated_amount'
                 }"), 0)::numeric AS cpm_estimated_amount
          FROM "${
            campaignId
              ? 'partner_campaign_daily_stats'
              : 'partner_cpm_daily_stats'
          }"
          ${cpmWhere}
          GROUP BY 1
        `,
        queryParams,
      ),
    ])

    const points = new Map<string, PartnerStatisticsPoint>()
    for (let i = 0; i < periodDays; i++) {
      const day = this.formatSqlDate(this.getUtcDayOffset(i - (periodDays - 1)))
      points.set(day, {
        date: day,
        registrations: 0,
        referral_deposit_amount: 0,
        impressions: 0,
        unique_impressions: 0,
        payable_impressions: 0,
        cpm_estimated_amount: 0,
      })
    }

    for (const row of registrationRows) {
      const point = points.get(String(row.day))
      if (point) {
        point.registrations = Number(row.registrations) || 0
      }
    }

    for (const row of depositRows) {
      const point = points.get(String(row.day))
      if (point) {
        point.referral_deposit_amount =
          Number(row.referral_deposit_amount) || 0
      }
    }

    for (const row of cpmRows) {
      const point = points.get(String(row.day))
      if (point) {
        point.impressions = Number(row.impressions) || 0
        point.unique_impressions = Number(row.unique_impressions) || 0
        point.payable_impressions = Number(row.payable_impressions) || 0
        point.cpm_estimated_amount = Number(row.cpm_estimated_amount) || 0
      }
    }

    const series = Array.from(points.values())
    const totals = series.reduce(
      (acc, point) => ({
        registrations: acc.registrations + point.registrations,
        referral_deposit_amount:
          acc.referral_deposit_amount + point.referral_deposit_amount,
        impressions: acc.impressions + point.impressions,
        unique_impressions: acc.unique_impressions + point.unique_impressions,
        payable_impressions:
          acc.payable_impressions + point.payable_impressions,
        cpm_estimated_amount:
          acc.cpm_estimated_amount + point.cpm_estimated_amount,
      }),
      {
        registrations: 0,
        referral_deposit_amount: 0,
        impressions: 0,
        unique_impressions: 0,
        payable_impressions: 0,
        cpm_estimated_amount: 0,
      },
    )

    const breakdown = await this.getStatisticsBreakdown(
      userId,
      periodDays,
      campaignId,
    )

    return { period_days: periodDays, totals, series, breakdown }
  }

  async trackReferralImpression(
    input: TrackReferralImpressionInput,
  ): Promise<{ tracked: boolean }> {
    const normalizedCode = (input.code ?? '').trim()
    if (!TRACKABLE_REFERRAL_CODE_REGEX.test(normalizedCode)) {
      return { tracked: false }
    }

    const promoCode = await this.promoCodeRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.created_by', 'owner')
      .where('UPPER(p.code) = UPPER(:code)', { code: normalizedCode })
      .getOne()

    if (
      !promoCode ||
      promoCode.type !== PromoCodeType.REFERRAL ||
      promoCode.status !== PromoCodeStatus.ACTIVE ||
      !promoCode.created_by
    ) {
      return { tracked: false }
    }

    const partnerId = promoCode.created_by.id
    const profile = await this.getOrCreateProfile(partnerId)
    const levels = await this.getLevels()
    const currentLevelConfig = levels.find(l => l.level === profile.profile.level)
    const cpmRate = currentLevelConfig?.cpm_rate ?? 0
    const source = this.normalizeCpmSource(input.source)
    const subId = this.normalizeCpmSource(input.subId)
    const campaign = await this.resolveCampaignForTracking(
      partnerId,
      input.campaign,
    )
    const day = this.formatSqlDate(new Date())
    const visitorHash = this.hashVisitor(input.ip, input.userAgent)

    await this.dataSource.transaction(async manager => {
      const visitorInsert = await manager.query(
        `
          INSERT INTO "partner_cpm_visitors"
            (
              "partner_user_id",
              "referral_code",
              "campaign_id",
              "visitor_hash",
              "day",
              "source",
              "sub_id"
            )
          VALUES ($1, $2, $3, $4, $5::date, $6, $7)
          ON CONFLICT ("partner_user_id", "visitor_hash", "day") DO NOTHING
          RETURNING "id"
        `,
        [
          partnerId,
          promoCode.code,
          campaign?.id ?? null,
          visitorHash,
          day,
          source,
          subId,
        ],
      )
      const isUnique = visitorInsert.length > 0
      const payableImpressions = isUnique && cpmRate > 0 ? 1 : 0
      const estimatedAmount = payableImpressions > 0 ? cpmRate / 1000 : 0

      await manager.query(
        `
          INSERT INTO "partner_cpm_daily_stats"
            (
              "partner_user_id",
              "referral_code",
              "campaign_id",
              "source",
              "sub_id",
              "day",
              "impressions",
              "unique_impressions",
              "payable_impressions",
              "estimated_amount"
            )
          VALUES ($1, $2, $3, $4, $5, $6::date, 1, $7, $8, $9)
          ON CONFLICT ("partner_user_id", "referral_code", "day")
          DO UPDATE SET
            "impressions" = "partner_cpm_daily_stats"."impressions" + 1,
            "unique_impressions" =
              "partner_cpm_daily_stats"."unique_impressions" + EXCLUDED."unique_impressions",
            "payable_impressions" =
              "partner_cpm_daily_stats"."payable_impressions" + EXCLUDED."payable_impressions",
            "estimated_amount" =
              "partner_cpm_daily_stats"."estimated_amount" + EXCLUDED."estimated_amount",
            "updated_at" = now()
        `,
        [
          partnerId,
          promoCode.code,
          campaign?.id ?? null,
          source,
          subId,
          day,
          isUnique ? 1 : 0,
          payableImpressions,
          estimatedAmount,
        ],
      )

      if (campaign) {
        await manager.query(
          `
            INSERT INTO "partner_campaign_daily_stats"
              (
                "partner_user_id",
                "campaign_id",
                "day",
                "impressions",
                "unique_impressions",
                "payable_impressions",
                "cpm_estimated_amount"
              )
            VALUES ($1, $2, $3::date, 1, $4, $5, $6)
            ON CONFLICT ("partner_user_id", "campaign_id", "day")
            DO UPDATE SET
              "impressions" = "partner_campaign_daily_stats"."impressions" + 1,
              "unique_impressions" =
                "partner_campaign_daily_stats"."unique_impressions" + EXCLUDED."unique_impressions",
              "payable_impressions" =
                "partner_campaign_daily_stats"."payable_impressions" + EXCLUDED."payable_impressions",
              "cpm_estimated_amount" =
                "partner_campaign_daily_stats"."cpm_estimated_amount" + EXCLUDED."cpm_estimated_amount",
              "updated_at" = now()
          `,
          [
            partnerId,
            campaign.id,
            day,
            isUnique ? 1 : 0,
            payableImpressions,
            estimatedAmount,
          ],
        )
      }
    })

    return { tracked: true }
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
    input: string | AttachReferralInput,
  ): Promise<boolean> {
    const data =
      typeof input === 'string'
        ? { code: input }
        : input
    const normalized = (data.code ?? '').trim()
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
    const campaign = await this.resolveCampaignForTracking(
      parentId,
      data.campaign,
    )
    const source = this.normalizeCpmSource(data.source)
    const subId = this.normalizeCpmSource(data.subId)

    const result = await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({
        referral_parent_id: parentId,
        referral_campaign_id: campaign?.id ?? null,
        referral_source: source,
        referral_sub_id: subId,
      })
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
    if (campaign) {
      await this.incrementCampaignRegistration(parentId, campaign.id)
    }
    void this.dispatchPartnerPostback(parentId, 'registration', {
      referral_user_id: userId,
      campaign_id: campaign?.id ?? null,
      campaign_slug: campaign?.slug ?? null,
      source,
      sub_id: subId,
    })
    return true
  }

  /**
   * Wraps attachReferralParent + current_uses bump for the post-OAuth attach flow.
   */
  async attachAndBump(
    userId: number,
    input: string | AttachReferralInput,
  ): Promise<boolean> {
    const code = typeof input === 'string' ? input : input.code
    const attached = await this.attachReferralParent(userId, input)
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

  async exportStatisticsCsv(
    userId: number,
    rawPeriodDays?: number,
    campaignId?: number,
  ): Promise<string> {
    const stats = await this.getStatistics(userId, rawPeriodDays, campaignId)
    const rows = [
      [
        'date',
        'registrations',
        'referral_deposit_amount',
        'impressions',
        'unique_impressions',
        'payable_impressions',
        'cpm_estimated_amount',
      ],
      ...stats.series.map(point => [
        point.date,
        String(point.registrations),
        point.referral_deposit_amount.toFixed(2),
        String(point.impressions),
        String(point.unique_impressions),
        String(point.payable_impressions),
        point.cpm_estimated_amount.toFixed(4),
      ]),
    ]

    return rows
      .map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(','))
      .join('\n')
  }

  private async ensureDefaultCampaign(userId: number): Promise<PartnerCampaign> {
    const existing = await this.partnerCampaignRepository.findOne({
      where: { user_id: userId, slug: DEFAULT_CAMPAIGN_SLUG },
    })
    if (existing) {
      return existing
    }

    try {
      return await this.partnerCampaignRepository.save(
        this.partnerCampaignRepository.create({
          user_id: userId,
          name: DEFAULT_CAMPAIGN_NAME,
          slug: DEFAULT_CAMPAIGN_SLUG,
          landing_path: '/',
          source: 'link',
          sub_id: null,
          status: PartnerCampaignStatus.ACTIVE,
        }),
      )
    } catch {
      const row = await this.partnerCampaignRepository.findOne({
        where: { user_id: userId, slug: DEFAULT_CAMPAIGN_SLUG },
      })
      if (!row) {
        throw new ConflictException('Failed to create default campaign')
      }
      return row
    }
  }

  private normalizeCampaignInput(
    input: UpsertPartnerCampaignInput,
    requireNameAndSlug: boolean,
  ): UpsertPartnerCampaignInput {
    const next: UpsertPartnerCampaignInput = {}
    const name = input.name?.trim()
    const slug = input.slug?.trim().toLowerCase()
    const landingPath = input.landing_path?.trim() || undefined
    const hasSource = Object.prototype.hasOwnProperty.call(input, 'source')
    const hasSubId = Object.prototype.hasOwnProperty.call(input, 'sub_id')
    const source = this.normalizeCpmSource(input.source)
    const subId = this.normalizeCpmSource(input.sub_id)

    if (name !== undefined) {
      if (!CAMPAIGN_NAME_REGEX.test(name)) {
        throw new BadRequestException('Campaign name must be 2-64 chars')
      }
      next.name = name
    } else if (requireNameAndSlug) {
      throw new BadRequestException('Campaign name is required')
    }

    if (slug !== undefined) {
      if (!CAMPAIGN_SLUG_REGEX.test(slug)) {
        throw new BadRequestException('Campaign slug must be 2-64 chars')
      }
      next.slug = slug
    } else if (requireNameAndSlug) {
      throw new BadRequestException('Campaign slug is required')
    }

    if (landingPath !== undefined) {
      if (!LANDING_PATH_REGEX.test(landingPath)) {
        throw new BadRequestException('Landing path must be a local path')
      }
      next.landing_path = landingPath
    } else if (requireNameAndSlug) {
      next.landing_path = '/'
    }

    if (input.status !== undefined) {
      if (!Object.values(PartnerCampaignStatus).includes(input.status)) {
        throw new BadRequestException('Invalid campaign status')
      }
      next.status = input.status
    }

    if (hasSource || requireNameAndSlug) {
      next.source = source
    }
    if (hasSubId || requireNameAndSlug) {
      next.sub_id = subId
    }

    return next
  }

  private async getCampaignStatsMap(
    userId: number,
    periodDays: number,
  ): Promise<Map<number, PartnerCampaignDto['stats_30d']>> {
    const startDateSql = this.formatSqlDate(
      this.getUtcDayOffset(-(periodDays - 1)),
    )
    const rows = await this.partnerCampaignDailyStatRepository.query(
      `
        SELECT "campaign_id",
               COALESCE(SUM("impressions"), 0)::int AS impressions,
               COALESCE(SUM("unique_impressions"), 0)::int AS unique_impressions,
               COALESCE(SUM("payable_impressions"), 0)::int AS payable_impressions,
               COALESCE(SUM("registrations"), 0)::int AS registrations,
               COALESCE(SUM("referral_deposit_amount"), 0)::numeric AS referral_deposit_amount,
               COALESCE(SUM("cpm_estimated_amount"), 0)::numeric AS cpm_estimated_amount
        FROM "partner_campaign_daily_stats"
        WHERE "partner_user_id" = $1
          AND "day" >= $2::date
        GROUP BY 1
      `,
      [userId, startDateSql],
    )
    const result = new Map<number, PartnerCampaignDto['stats_30d']>()
    for (const row of rows) {
      result.set(Number(row.campaign_id), {
        impressions: Number(row.impressions) || 0,
        unique_impressions: Number(row.unique_impressions) || 0,
        payable_impressions: Number(row.payable_impressions) || 0,
        registrations: Number(row.registrations) || 0,
        referral_deposit_amount: Number(row.referral_deposit_amount) || 0,
        cpm_estimated_amount: Number(row.cpm_estimated_amount) || 0,
      })
    }
    return result
  }

  private emptyCampaignStats(): PartnerCampaignDto['stats_30d'] {
    return {
      impressions: 0,
      unique_impressions: 0,
      payable_impressions: 0,
      registrations: 0,
      referral_deposit_amount: 0,
      cpm_estimated_amount: 0,
    }
  }

  private toCampaignDto(
    campaign: PartnerCampaign,
    stats: PartnerCampaignDto['stats_30d'],
  ): PartnerCampaignDto {
    return {
      id: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
      landing_path: campaign.landing_path,
      source: campaign.source,
      sub_id: campaign.sub_id,
      status: campaign.status,
      created_at: campaign.created_at,
      stats_30d: stats,
    }
  }

  private async resolveCampaignForTracking(
    userId: number,
    rawCampaign?: string | null,
  ): Promise<PartnerCampaign | null> {
    const campaignSlug = rawCampaign?.trim().toLowerCase()
    if (!campaignSlug || !CAMPAIGN_SLUG_REGEX.test(campaignSlug)) {
      return null
    }

    return this.partnerCampaignRepository.findOne({
      where: {
        user_id: userId,
        slug: campaignSlug,
        status: PartnerCampaignStatus.ACTIVE,
      },
    })
  }

  private async incrementCampaignRegistration(
    userId: number,
    campaignId: number,
  ): Promise<void> {
    const day = this.formatSqlDate(new Date())
    await this.partnerCampaignDailyStatRepository.query(
      `
        INSERT INTO "partner_campaign_daily_stats"
          ("partner_user_id", "campaign_id", "day", "registrations")
        VALUES ($1, $2, $3::date, 1)
        ON CONFLICT ("partner_user_id", "campaign_id", "day")
        DO UPDATE SET
          "registrations" = "partner_campaign_daily_stats"."registrations" + 1,
          "updated_at" = now()
      `,
      [userId, campaignId, day],
    )
  }

  private async getStatisticsBreakdown(
    userId: number,
    periodDays: number,
    campaignId?: number,
  ): Promise<PartnerStatistics['breakdown']> {
    const startDateSql = this.formatSqlDate(
      this.getUtcDayOffset(-(periodDays - 1)),
    )
    const campaignClause =
      campaignId && campaignId > 0 ? 'AND c."id" = $3' : ''
    const campaignParams = campaignId
      ? [userId, startDateSql, campaignId]
      : [userId, startDateSql]

    const [campaignRows, sourceRows, registrationRows, activeRows] =
      await Promise.all([
        this.partnerCampaignRepository.query(
          `
            SELECT
              c."id",
              c."name",
              c."slug",
              c."status",
              COALESCE(SUM(s."impressions"), 0)::int AS impressions,
              COALESCE(SUM(s."unique_impressions"), 0)::int AS unique_impressions,
              COALESCE(SUM(s."payable_impressions"), 0)::int AS payable_impressions,
              COALESCE(SUM(s."registrations"), 0)::int AS registrations,
              COALESCE(SUM(s."referral_deposit_amount"), 0)::numeric AS referral_deposit_amount,
              COALESCE(SUM(s."cpm_estimated_amount"), 0)::numeric AS cpm_estimated_amount
            FROM "partner_campaigns" c
            LEFT JOIN "partner_campaign_daily_stats" s
              ON s."campaign_id" = c."id"
             AND s."partner_user_id" = c."user_id"
             AND s."day" >= $2::date
            WHERE c."user_id" = $1
              ${campaignClause}
            GROUP BY c."id", c."name", c."slug", c."status"
            ORDER BY unique_impressions DESC, registrations DESC, c."created_at" ASC
            LIMIT 20
          `,
          campaignParams,
        ),
        this.dataSource.query(
          `
            SELECT
              COALESCE("source", 'direct') AS source,
              COALESCE("sub_id", '') AS sub_id,
              "campaign_id",
              COUNT(*)::int AS unique_impressions
            FROM "partner_cpm_visitors"
            WHERE "partner_user_id" = $1
              AND "day" >= $2::date
              ${campaignId && campaignId > 0 ? 'AND "campaign_id" = $3' : ''}
            GROUP BY 1, 2, 3
            ORDER BY unique_impressions DESC
            LIMIT 20
          `,
          campaignParams,
        ),
        this.userRepository.query(
          `
            SELECT
              COALESCE("referral_source", 'direct') AS source,
              COALESCE("referral_sub_id", '') AS sub_id,
              "referral_campaign_id" AS campaign_id,
              COUNT(*)::int AS registrations,
              COALESCE(SUM("deposit_amount"), 0)::numeric AS referral_deposit_amount
            FROM "users"
            WHERE "referral_parent_id" = $1
              AND "created_at" >= $2::date
              ${campaignId && campaignId > 0 ? 'AND "referral_campaign_id" = $3' : ''}
            GROUP BY 1, 2, 3
          `,
          campaignParams,
        ),
        this.userRepository.query(
          `
            SELECT
              COALESCE("referral_source", 'direct') AS source,
              COALESCE("referral_sub_id", '') AS sub_id,
              "referral_campaign_id" AS campaign_id,
              COUNT(*)::int AS active_referrals
            FROM "users"
            WHERE "referral_parent_id" = $1
              AND "created_at" >= $2::date
              AND COALESCE("deposit_amount", 0) > 0
              ${campaignId && campaignId > 0 ? 'AND "referral_campaign_id" = $3' : ''}
            GROUP BY 1, 2, 3
          `,
          campaignParams,
        ),
      ])

    const profile = await this.partnerProfileRepository.findOne({
      where: { user_id: userId },
    })
    const currentLevel = (await this.getLevels()).find(
      level => level.level === profile?.level,
    )
    const cpmRate = currentLevel?.cpm_rate ?? 0

    const sourceMap = new Map<string, PartnerStatisticsBreakdownItem>()
    const ensureSourceItem = (
      row: {
        source?: string | null
        sub_id?: string | null
        campaign_id?: number | null
      },
    ) => {
      const source = row.source || 'direct'
      const subId = row.sub_id || null
      const campaign = row.campaign_id ? Number(row.campaign_id) : null
      const id = `${source}:${subId ?? ''}:${campaign ?? ''}`
      const existing = sourceMap.get(id)
      if (existing) {
        return existing
      }

      const item: PartnerStatisticsBreakdownItem = {
        id,
        name: subId ? `${source} / ${subId}` : source,
        campaign_id: campaign,
        campaign_slug: null,
        source,
        sub_id: subId,
        impressions: 0,
        unique_impressions: 0,
        payable_impressions: 0,
        registrations: 0,
        active_referrals: 0,
        referral_deposit_amount: 0,
        cpm_estimated_amount: 0,
      }
      sourceMap.set(id, item)
      return item
    }

    for (const row of sourceRows) {
      const item = ensureSourceItem(row)
      const unique = Number(row.unique_impressions) || 0
      item.unique_impressions += unique
      item.impressions += unique
      item.payable_impressions += cpmRate > 0 ? unique : 0
      item.cpm_estimated_amount += cpmRate > 0 ? (unique * cpmRate) / 1000 : 0
    }
    for (const row of registrationRows) {
      const item = ensureSourceItem(row)
      item.registrations += Number(row.registrations) || 0
      item.referral_deposit_amount += Number(row.referral_deposit_amount) || 0
    }
    for (const row of activeRows) {
      const item = ensureSourceItem(row)
      item.active_referrals += Number(row.active_referrals) || 0
    }

    const campaigns: PartnerStatisticsBreakdownItem[] = campaignRows.map((row: {
      id: number | string
      name: string
      slug: string
      impressions: number | string
      unique_impressions: number | string
      payable_impressions: number | string
      registrations: number | string
      referral_deposit_amount: number | string
      cpm_estimated_amount: number | string
    }) => ({
      id: `campaign:${row.id}`,
      name: row.name,
      campaign_id: Number(row.id),
      campaign_slug: row.slug,
      source: null,
      sub_id: null,
      impressions: Number(row.impressions) || 0,
      unique_impressions: Number(row.unique_impressions) || 0,
      payable_impressions: Number(row.payable_impressions) || 0,
      registrations: Number(row.registrations) || 0,
      active_referrals: 0,
      referral_deposit_amount: Number(row.referral_deposit_amount) || 0,
      cpm_estimated_amount: Number(row.cpm_estimated_amount) || 0,
    }))

    return {
      campaigns,
      sources: Array.from(sourceMap.values()).sort(
        (a, b) =>
          b.unique_impressions - a.unique_impressions ||
          b.registrations - a.registrations,
      ),
    }
  }

  private getSupportedPostbackEvents(): PartnerPostbackEventType[] {
    return [
      'registration',
      'first_deposit',
      'commission_approved',
      'payout_paid',
    ]
  }

  private async incrementCampaignReferralDeposit(
    manager: EntityManager,
    input: PartnerReferralDepositInput,
    partnerUserId: number,
    amount: number,
  ): Promise<void> {
    const campaignId = input.referralUser.referral_campaign_id
    if (!campaignId) {
      return
    }

    await manager.query(
      `
        INSERT INTO "partner_campaign_daily_stats"
          (
            "partner_user_id",
            "campaign_id",
            "day",
            "referral_deposit_amount",
            "created_at",
            "updated_at"
          )
        VALUES ($1, $2, $3::date, $4, NOW(), NOW())
        ON CONFLICT ("partner_user_id", "campaign_id", "day")
        DO UPDATE SET
          "referral_deposit_amount" =
            ROUND(("partner_campaign_daily_stats"."referral_deposit_amount" + EXCLUDED."referral_deposit_amount")::numeric, 2),
          "updated_at" = NOW()
      `,
      [partnerUserId, campaignId, this.formatSqlDate(new Date()), amount],
    )
  }

  private async dispatchPartnerPostback(
    partnerUserId: number,
    eventType: PartnerPostbackEventType,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const row = await this.getOrCreatePostbackSetting(partnerUserId)
      if (!row.enabled || !row.postback_url) {
        return
      }
      await this.deliverPartnerPostback(partnerUserId, row, eventType, data)
    } catch (error) {
      this.logger.warn(
        `Failed to dispatch partner postback for user ${partnerUserId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      )
    }
  }

  private async deliverPartnerPostback(
    partnerUserId: number,
    setting: PartnerPostbackSetting,
    eventType: PartnerPostbackEventType,
    data: Record<string, unknown>,
  ): Promise<PartnerPostbackDeliveryDto> {
    if (
      !setting.postback_url ||
      !(await isResolvedPartnerPostbackUrlSafe(setting.postback_url))
    ) {
      return this.persistPostbackDelivery({
        partnerUserId,
        eventType,
        status: 'SKIPPED',
        targetUrl: setting.postback_url,
        httpStatus: null,
        error: 'Unsafe or empty postback URL',
        attempts: 0,
      })
    }

    const payload = buildPartnerPostbackPayload({
      eventType,
      partnerUserId,
      data,
    })
    const signature = signPartnerPostbackPayload(payload, setting.secret)

    try {
      const response = await axios.post(setting.postback_url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Bunny-Event': eventType,
          'X-Bunny-Signature': signature,
        },
        timeout: 5000,
        maxRedirects: 0,
        validateStatus: () => true,
      })

      const ok = response.status >= 200 && response.status < 300
      return this.persistPostbackDelivery({
        partnerUserId,
        eventType,
        status: ok ? 'SUCCESS' : 'FAILED',
        targetUrl: setting.postback_url,
        httpStatus: response.status,
        error: ok ? null : `HTTP ${response.status}`,
        attempts: 1,
        payload,
      })
    } catch (error) {
      return this.persistPostbackDelivery({
        partnerUserId,
        eventType,
        status: 'FAILED',
        targetUrl: setting.postback_url,
        httpStatus: null,
        error: error instanceof Error ? error.message.slice(0, 512) : 'Unknown error',
        attempts: 1,
        payload,
      })
    }
  }

  private async persistPostbackDelivery(input: {
    partnerUserId: number
    eventType: PartnerPostbackEventType
    status: PartnerPostbackDeliveryDto['status']
    targetUrl: string | null
    httpStatus: number | null
    error: string | null
    attempts: number
    payload?: PartnerPostbackPayload
  }): Promise<PartnerPostbackDeliveryDto> {
    const createdAt = new Date()
    try {
      const rows = await this.dataSource.query(
        `
          INSERT INTO "partner_postback_delivery_logs"
            (
              "partner_user_id",
              "event_type",
              "status",
              "target_url",
              "http_status",
              "error",
              "attempts",
              "payload"
            )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          RETURNING "id", "created_at"
        `,
        [
          input.partnerUserId,
          input.eventType,
          input.status,
          input.targetUrl,
          input.httpStatus,
          input.error,
          input.attempts,
          JSON.stringify(input.payload ?? {}),
        ],
      )

      return {
        id: Number(rows[0]?.id) || null,
        event_type: input.eventType,
        status: input.status,
        target_url: input.targetUrl,
        http_status: input.httpStatus,
        error: input.error,
        attempts: input.attempts,
        created_at: rows[0]?.created_at ?? createdAt,
      }
    } catch (error) {
      this.logger.warn(
        `Postback delivery was not persisted: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      )
      return {
        id: null,
        event_type: input.eventType,
        status: input.status,
        target_url: input.targetUrl,
        http_status: input.httpStatus,
        error: input.error,
        attempts: input.attempts,
        created_at: createdAt,
      }
    }
  }

  private async getOrCreatePostbackSetting(
    userId: number,
  ): Promise<PartnerPostbackSetting> {
    const existing = await this.partnerPostbackSettingRepository.findOne({
      where: { user_id: userId },
    })
    if (existing) {
      return existing
    }

    try {
      return await this.partnerPostbackSettingRepository.save(
        this.partnerPostbackSettingRepository.create({
          user_id: userId,
          enabled: false,
          postback_url: null,
          secret: randomBytes(24).toString('hex'),
        }),
      )
    } catch {
      const row = await this.partnerPostbackSettingRepository.findOne({
        where: { user_id: userId },
      })
      if (!row) {
        throw new ConflictException('Failed to create postback settings')
      }
      return row
    }
  }

  private isSafePostbackUrl(rawUrl: string): Promise<boolean> {
    return isResolvedPartnerPostbackUrlSafe(rawUrl)
  }

  private getReferralStatus(user: User): PartnerReferralStatus {
    if ((user.deposit_amount ?? 0) > 0) {
      return 'active'
    }
    return 'unconverted'
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

  private async getCpmTotalsForPeriod(
    userId: number,
    periodDays: number,
  ): Promise<{
    impressions: number
    unique_impressions: number
    payable_impressions: number
    estimated_amount: number
  }> {
    const startDateSql = this.formatSqlDate(
      this.getUtcDayOffset(-(periodDays - 1)),
    )
    const rows = await this.partnerCpmDailyStatRepository.query(
      `
        SELECT COALESCE(SUM("impressions"), 0)::int AS impressions,
               COALESCE(SUM("unique_impressions"), 0)::int AS unique_impressions,
               COALESCE(SUM("payable_impressions"), 0)::int AS payable_impressions,
               COALESCE(SUM("estimated_amount"), 0)::numeric AS estimated_amount
        FROM "partner_cpm_daily_stats"
        WHERE "partner_user_id" = $1
          AND "day" >= $2::date
      `,
      [userId, startDateSql],
    )
    const row = rows[0] ?? {}

    return {
      impressions: Number(row.impressions) || 0,
      unique_impressions: Number(row.unique_impressions) || 0,
      payable_impressions: Number(row.payable_impressions) || 0,
      estimated_amount: Number(row.estimated_amount) || 0,
    }
  }

  private async getAdminCampaigns(
    userId: number,
  ): Promise<PartnerCampaignDto[]> {
    const campaigns = await this.partnerCampaignRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    })
    const stats = await this.getCampaignStatsMap(userId, DEFAULT_STATS_PERIOD_DAYS)

    return campaigns.map(campaign =>
      this.toCampaignDto(
        campaign,
        stats.get(campaign.id) ?? this.emptyCampaignStats(),
      ),
    )
  }

  private async getAdminLedger(userId: number): Promise<{
    available: number
    pending: number
    min_payout: number
    items: PartnerLedgerDto[]
  }> {
    const [profile, ledgerRows] = await Promise.all([
      this.partnerProfileRepository.findOne({ where: { user_id: userId } }),
      this.partnerCommissionLedgerRepository.find({
        where: { partner_user_id: userId },
        order: { created_at: 'DESC' },
        take: 100,
      }),
    ])
    const pending = ledgerRows
      .filter(row => row.status === PartnerLedgerStatus.PENDING)
      .reduce((sum, row) => sum + row.amount, 0)

    return {
      available: profile?.referral_balance ?? 0,
      pending,
      min_payout: 10,
      items: ledgerRows.map(row => ({
        id: row.id,
        type: row.type,
        status: row.status,
        amount: row.amount,
        reference: row.reference,
        description: row.description,
        campaign_id: row.campaign_id,
        created_at: row.created_at,
      })),
    }
  }

  private async loadAdminPartnerMaps(
    userIds: number[],
  ): Promise<AdminPartnerMaps> {
    if (userIds.length === 0) {
      return {
        campaigns: new Map(),
        codes: new Map(),
        postbacks: new Map(),
        referrals: new Map(),
      }
    }

    const [codeRows, referralRows, campaignRows, postbackRows] =
      await Promise.all([
        this.dataSource.query(
          `
            SELECT DISTINCT ON ("created_by")
              "created_by" AS user_id,
              "code"
            FROM "promo_codes"
            WHERE "created_by" = ANY($1::int[])
              AND "type" = $2
              AND "status" = $3
            ORDER BY "created_by", "created_at" DESC
          `,
          [userIds, PromoCodeType.REFERRAL, PromoCodeStatus.ACTIVE],
        ),
        this.dataSource.query(
          `
            SELECT
              "referral_parent_id" AS user_id,
              COUNT(*) FILTER (WHERE COALESCE("deposit_amount", 0) > 0)::int AS active_referrals,
              COALESCE(SUM("deposit_amount"), 0)::numeric AS referral_deposit_amount
            FROM "users"
            WHERE "referral_parent_id" = ANY($1::int[])
            GROUP BY 1
          `,
          [userIds],
        ),
        this.dataSource.query(
          `
            SELECT
              "user_id",
              COUNT(*)::int AS campaign_count
            FROM "partner_campaigns"
            WHERE "user_id" = ANY($1::int[])
            GROUP BY 1
          `,
          [userIds],
        ),
        this.dataSource.query(
          `
            SELECT
              "user_id",
              "enabled" AS postback_enabled
            FROM "partner_postback_settings"
            WHERE "user_id" = ANY($1::int[])
          `,
          [userIds],
        ),
      ])

    return {
      campaigns: new Map(
        campaignRows.map((row: { campaign_count: string | number; user_id: string | number }) => [
          Number(row.user_id),
          Number(row.campaign_count) || 0,
        ]),
      ),
      codes: new Map(
        codeRows.map((row: { code: string; user_id: string | number }) => [
          Number(row.user_id),
          row.code,
        ]),
      ),
      postbacks: new Map(
        postbackRows.map((row: { postback_enabled: boolean; user_id: string | number }) => [
          Number(row.user_id),
          Boolean(row.postback_enabled),
        ]),
      ),
      referrals: new Map(
        referralRows.map(
          (row: {
            active_referrals: string | number
            referral_deposit_amount: string | number
            user_id: string | number
          }) => [
            Number(row.user_id),
            {
              active_referrals: Number(row.active_referrals) || 0,
              referral_deposit_amount:
                Number(row.referral_deposit_amount) || 0,
            },
          ],
        ),
      ),
    }
  }

  private toAdminPartnerItem(
    profile: PartnerProfile,
    maps: AdminPartnerMaps,
    levelMap: Map<PartnerLevel, string>,
  ): AdminPartnerItem {
    const referrals = maps.referrals.get(profile.user_id)

    return {
      id: profile.id,
      user_id: profile.user_id,
      user: {
        avatar: profile.user?.avatar ?? null,
        display_name: profile.user?.display_name ?? `User #${profile.user_id}`,
        id: profile.user?.id ?? profile.user_id,
        role: profile.user?.role ?? 'user',
      },
      level: profile.level,
      level_name: levelMap.get(profile.level) ?? String(profile.level),
      referral_code: maps.codes.get(profile.user_id) ?? null,
      referral_balance: Number(profile.referral_balance) || 0,
      total_earned: Number(profile.total_earned) || 0,
      total_referrals_deposit:
        Number(profile.total_referrals_deposit) || 0,
      active_referrals: referrals?.active_referrals ?? 0,
      referral_deposit_amount: referrals?.referral_deposit_amount ?? 0,
      campaign_count: maps.campaigns.get(profile.user_id) ?? 0,
      postback_enabled: maps.postbacks.get(profile.user_id) ?? false,
      code_locked_by_admin: profile.code_locked_by_admin,
      last_code_change_at: profile.last_code_change_at,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
    }
  }

  private toLevelDto(row: PartnerLevelConfig): PartnerLevelDto {
    return {
      cpm_rate: Number(row.cpm_rate) || 0,
      level: row.level as PartnerLevel,
      min_referrals_deposit: Number(row.min_referrals_deposit) || 0,
      name: row.name,
      referral_percentage: Number(row.referral_percentage) || 0,
      your_percentage: Number(row.your_percentage) || 0,
    }
  }

  private normalizeStatsPeriod(rawPeriodDays?: number): number {
    const parsed = Number(rawPeriodDays ?? DEFAULT_STATS_PERIOD_DAYS)
    if (!Number.isFinite(parsed)) {
      return DEFAULT_STATS_PERIOD_DAYS
    }

    return Math.max(1, Math.min(MAX_STATS_PERIOD_DAYS, Math.trunc(parsed)))
  }

  private getUtcDayOffset(offsetDays: number): Date {
    const now = new Date()
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + offsetDays,
      ),
    )
  }

  private formatSqlDate(date: Date): string {
    return date.toISOString().slice(0, 10)
  }

  private normalizeCpmSource(source?: string | null): string | null {
    const normalized = (source ?? '').trim()
    if (!normalized || !CPM_SOURCE_REGEX.test(normalized)) {
      return null
    }

    return normalized.slice(0, 64)
  }

  private hashVisitor(ip: string, userAgent: string): string {
    const salt =
      process.env.PARTNER_ATTRIBUTION_SALT ||
      process.env.JWT_ACCESS_SECRET ||
      'bunny-local-dev'
    return createHash('sha256')
      .update(`${salt}:${ip || 'unknown'}:${userAgent || 'unknown'}`)
      .digest('hex')
  }

  private toDashboard(
    profile: PartnerProfile,
    code: PromoCode,
    activeReferrals: number,
    levels: PartnerLevelDto[],
    cpmStats = {
      impressions: 0,
      unique_impressions: 0,
      payable_impressions: 0,
      estimated_amount: 0,
    },
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
      cpm_rate: currentLevelConfig?.cpm_rate ?? 0,
      traffic_impressions_30d: cpmStats.impressions,
      traffic_unique_30d: cpmStats.unique_impressions,
      traffic_payable_30d: cpmStats.payable_impressions,
      cpm_estimated_30d: cpmStats.estimated_amount,
      can_change_code: canChangeCode,
      next_code_change_at: cooldownActive ? nextChangeAt : null,
      code_locked_by_admin: profile.code_locked_by_admin,
    }
  }
}
