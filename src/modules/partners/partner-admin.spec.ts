import assert from 'node:assert/strict'

import { PartnerService } from './partner.service'
import { PartnerLevel } from './entities/partnerProfile.entity'

const createQueryBuilderMock = (items: unknown[], total: number) => {
  const calls: {
    andWhere: unknown[][]
    joins: unknown[][]
    leftJoin: unknown[][]
    orderBy: unknown[][]
    skip: unknown[]
    take: unknown[]
    where: unknown[][]
  } = {
    andWhere: [],
    joins: [],
    leftJoin: [],
    orderBy: [],
    skip: [],
    take: [],
    where: [],
  }

  const queryBuilder = {
    calls,
    andWhere: (...args: unknown[]) => {
      calls.andWhere.push(args)
      return queryBuilder
    },
    getManyAndCount: async () => [items, total] as const,
    leftJoin: (...args: unknown[]) => {
      calls.leftJoin.push(args)
      return queryBuilder
    },
    leftJoinAndSelect: (...args: unknown[]) => {
      calls.joins.push(args)
      return queryBuilder
    },
    orderBy: (...args: unknown[]) => {
      calls.orderBy.push(args)
      return queryBuilder
    },
    skip: (value: unknown) => {
      calls.skip.push(value)
      return queryBuilder
    },
    take: (value: unknown) => {
      calls.take.push(value)
      return queryBuilder
    },
    where: (...args: unknown[]) => {
      calls.where.push(args)
      return queryBuilder
    },
  }

  return queryBuilder
}

const createService = (queryBuilder: ReturnType<typeof createQueryBuilderMock>) => {
  const partnerProfileRepository = {
    createQueryBuilder: (alias: string) => {
      assert.equal(alias, 'profile')
      return queryBuilder
    },
  }
  const partnerLevelRepository = {
    find: async () => [
      {
        cpm_rate: 1,
        level: PartnerLevel.BRONZE,
        min_referrals_deposit: 0,
        name: 'bronze',
        referral_percentage: 5,
        your_percentage: 10,
      },
    ],
  }
  const partnerPostbackSettingRepository = {
    count: async () => 1,
  }
  const partnerCampaignRepository = {
    count: async () => 2,
  }
  const partnerCommissionLedgerRepository = {}
  const partnerCampaignDailyStatRepository = {}
  const partnerCpmDailyStatRepository = {}
  const promoCodeRepository = {}
  const userRepository = {}
  const dataSource = {
    query: async (sql: string) => {
      if (sql.includes('FROM "users"')) {
        return [
          {
            active_referrals: 2,
            referral_deposit_amount: '75',
            user_id: 42,
          },
        ]
      }
      if (sql.includes('FROM "partner_campaigns"')) {
        return [{ campaign_count: 3, user_id: 42 }]
      }
      if (sql.includes('FROM "partner_postback_settings"')) {
        return [{ postback_enabled: true, user_id: 42 }]
      }
      if (sql.includes('FROM "promo_codes"')) {
        return [{ code: 'RBT-XPUF', user_id: 42 }]
      }
      if (sql.includes('FROM "partner_commission_ledger"')) {
        return [
          {
            approved_amount: '12',
            paid_amount: '8',
            pending_amount: '4',
          },
        ]
      }
      if (sql.includes('FROM "partner_cpm_daily_stats"')) {
        return [
          {
            cpm_estimated_amount: '1.5',
            impressions: 100,
            payable_impressions: 50,
            unique_impressions: 80,
          },
        ]
      }
      return []
    },
  }

  return new PartnerService(
    partnerProfileRepository as never,
    partnerLevelRepository as never,
    partnerCpmDailyStatRepository as never,
    partnerCampaignRepository as never,
    partnerCampaignDailyStatRepository as never,
    partnerCommissionLedgerRepository as never,
    partnerPostbackSettingRepository as never,
    promoCodeRepository as never,
    userRepository as never,
    dataSource as never,
  )
}

async function listsPartnersForAdminWithFilters() {
  const rows = [
    {
      code_locked_by_admin: false,
      created_at: new Date('2026-05-13T10:00:00Z'),
      id: 7,
      last_code_change_at: null,
      level: PartnerLevel.SILVER,
      referral_balance: 12.5,
      total_earned: 30,
      total_referrals_deposit: 75,
      updated_at: new Date('2026-05-13T10:01:00Z'),
      user: {
        avatar: null,
        display_name: 'xpuf',
        id: 42,
        role: 'partner',
      },
      user_id: 42,
    },
  ]
  const queryBuilder = createQueryBuilderMock(rows, 6)
  const service = createService(queryBuilder)

  const result = await service.findAllForAdmin({
    codeLocked: false,
    level: PartnerLevel.SILVER,
    limit: 5,
    maxBalance: 100,
    minBalance: 1,
    page: 2,
    search: 'xpuf',
    userId: 42,
  })

  const predicates = [
    ...queryBuilder.calls.where,
    ...queryBuilder.calls.andWhere,
  ]
    .map(call => String(call[0]))
    .join('\n')

  assert.equal(result.total, 6)
  assert.equal(result.page, 2)
  assert.equal(result.limit, 5)
  assert.equal(result.totalPages, 2)
  assert.equal(result.items[0]?.user.id, 42)
  assert.equal(result.items[0]?.referral_code, 'RBT-XPUF')
  assert.equal(result.items[0]?.active_referrals, 2)
  assert.equal(result.items[0]?.campaign_count, 3)
  assert.equal(result.items[0]?.postback_enabled, true)
  assert.equal(queryBuilder.calls.joins.length, 1)
  assert.equal(queryBuilder.calls.leftJoin.length, 1)
  assert.equal(queryBuilder.calls.skip[0], 5)
  assert.equal(queryBuilder.calls.take[0], 5)
  assert.match(predicates, /profile\.level = :level/)
  assert.match(predicates, /profile\.user_id = :userId/)
  assert.match(predicates, /profile\.code_locked_by_admin = :codeLocked/)
  assert.match(predicates, /profile\.referral_balance >= :minBalance/)
  assert.match(predicates, /profile\.referral_balance <= :maxBalance/)
  assert.match(predicates, /ILIKE :search/)
}

async function returnsAdminOverview() {
  const queryBuilder = createQueryBuilderMock([], 0)
  const service = createService(queryBuilder)

  const overview = await service.getAdminOverview()

  assert.equal(overview.active_campaigns, 2)
  assert.equal(overview.postback_enabled, 1)
  assert.equal(overview.ledger.pending_amount, 4)
  assert.equal(overview.traffic_30d.unique_impressions, 80)
  assert.equal(overview.levels[0]?.name, 'bronze')
}

async function recordsReferralDepositSideEffects() {
  const queryBuilder = createQueryBuilderMock([], 0)
  const service = createService(queryBuilder)
  const queries: { params: unknown[]; sql: string }[] = []
  const savedProfiles: unknown[] = []
  const profile = {
    level: PartnerLevel.BRONZE,
    total_referrals_deposit: 125,
    user_id: 7,
  }
  const manager = {
    getRepository: (entity: { name?: string }) => {
      if (entity.name === 'PartnerProfile') {
        return {
          findOne: async () => profile,
          save: async (next: unknown) => {
            savedProfiles.push(next)
            return next
          },
        }
      }
      if (entity.name === 'PartnerLevelConfig') {
        return {
          find: async () => [
            {
              level: PartnerLevel.BRONZE,
              min_referrals_deposit: 0,
            },
            {
              level: PartnerLevel.SILVER,
              min_referrals_deposit: 100,
            },
          ],
        }
      }
      throw new Error(`Unexpected repository: ${entity.name ?? 'unknown'}`)
    },
    query: async (sql: string, params: unknown[]) => {
      queries.push({ params, sql })
      return [{ total_referrals_deposit: '125' }]
    },
  }

  const postback = await service.recordReferralDeposit(manager as never, {
    amount: 100,
    depositId: 55,
    firstDeposit: true,
    referralUser: {
      display_name: 'Referral',
      id: 42,
      referral_campaign_id: 3,
      referral_parent_id: 7,
      referral_source: 'telegram',
      referral_sub_id: 'a1',
    },
    source: 'skinsback',
  })

  assert.equal(postback?.partnerUserId, 7)
  assert.equal(postback?.data.amount, 100)
  assert.equal(postback?.data.deposit_id, 55)
  assert.equal(postback?.data.total_referrals_deposit, 125)
  assert.equal(profile.level, PartnerLevel.SILVER)
  assert.equal(savedProfiles.length, 1)
  assert.match(queries[0]?.sql ?? '', /partner_profiles/)
  assert.deepEqual(queries[0]?.params, [7, PartnerLevel.BRONZE, 100])
  assert.match(queries[1]?.sql ?? '', /partner_campaign_daily_stats/)
  assert.equal(queries[1]?.params[0], 7)
  assert.equal(queries[1]?.params[1], 3)
  assert.equal(queries[1]?.params[3], 100)
}

async function run() {
  await listsPartnersForAdminWithFilters()
  await returnsAdminOverview()
  await recordsReferralDepositSideEffects()
}

void run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
