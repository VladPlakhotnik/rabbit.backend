export type VipLedgerSourceType =
  | 'case_open'
  | 'mines_round'
  | 'crash_round'
  | 'upgrade_attempt'
  | 'historical_case_backfill'

export interface CaseVipItem {
  chance: number | null | undefined
  marketPrice: number | null | undefined
}

export interface VipEarningInput {
  sourceType: VipLedgerSourceType
  wagerAmount: number
  houseEdgeBps: number
  productXpRateBps?: number
}

export interface FixedHouseEdgeVipEarningInput {
  sourceType: VipLedgerSourceType
  wagerAmount: number
  houseEdgeBps: number
  productXpRateBps?: number
}

export interface UpgradeHouseEdgeInput {
  sourceAmount: number
  targetMarketPrice: number
  winChancePercent: number
}

export interface VipEarning {
  sourceType: VipLedgerSourceType
  wagerAmount: number
  houseEdgeBps: number
  productXpRateBps: number
  theoreticalRake: number
  vipXp: number
}

export const BPS_DENOMINATOR = 10_000
export const CASE_PRODUCT_XP_RATE_BPS = 10_000
export const MINES_PRODUCT_HOUSE_EDGE_BPS = 400
export const CRASH_PRODUCT_HOUSE_EDGE_BPS = 300
export const UPGRADE_PRODUCT_HOUSE_EDGE_BPS = 400
export const VIP_BASE_XP_HOUSE_EDGE_BPS = 1_000

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const toMoney = (value: number): number => Math.round(value * 100) / 100

const normalizePositiveNumber = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0
  }

  return value
}

export const estimateCaseHouseEdgeBps = (
  casePrice: number,
  items: readonly CaseVipItem[],
): number => {
  const normalizedCasePrice = normalizePositiveNumber(casePrice)
  if (normalizedCasePrice === 0 || items.length === 0) {
    return 0
  }

  const expectedPayout = items.reduce((total, item) => {
    const chance = normalizePositiveNumber(item.chance)
    const marketPrice = normalizePositiveNumber(item.marketPrice)

    return total + marketPrice * (chance / 100)
  }, 0)

  const houseEdgeRate = clamp(
    (normalizedCasePrice - expectedPayout) / normalizedCasePrice,
    0,
    1,
  )

  return Math.round(houseEdgeRate * BPS_DENOMINATOR)
}

export const estimateUpgradeHouseEdgeBps = ({
  sourceAmount,
  targetMarketPrice,
  winChancePercent,
}: UpgradeHouseEdgeInput): number => {
  const normalizedSourceAmount = normalizePositiveNumber(sourceAmount)
  const normalizedTargetMarketPrice = normalizePositiveNumber(targetMarketPrice)
  const normalizedWinChancePercent = clamp(
    normalizePositiveNumber(winChancePercent),
    0,
    100,
  )

  if (normalizedSourceAmount === 0 || normalizedTargetMarketPrice === 0) {
    return 0
  }

  const expectedPayout =
    normalizedTargetMarketPrice * (normalizedWinChancePercent / 100)
  const houseEdgeRate = clamp(
    (normalizedSourceAmount - expectedPayout) / normalizedSourceAmount,
    0,
    1,
  )

  return Math.round(houseEdgeRate * BPS_DENOMINATOR)
}

export const calculateVipEarning = ({
  sourceType,
  wagerAmount,
  houseEdgeBps,
  productXpRateBps = CASE_PRODUCT_XP_RATE_BPS,
}: VipEarningInput): VipEarning => {
  const normalizedWager = toMoney(normalizePositiveNumber(wagerAmount))
  const normalizedHouseEdgeBps = clamp(
    Math.round(houseEdgeBps),
    0,
    BPS_DENOMINATOR,
  )
  const normalizedProductXpRateBps = clamp(
    Math.round(productXpRateBps),
    0,
    BPS_DENOMINATOR,
  )
  const theoreticalRake = toMoney(
    normalizedWager * (normalizedHouseEdgeBps / BPS_DENOMINATOR),
  )
  const baseHouseEdgeRate = VIP_BASE_XP_HOUSE_EDGE_BPS / BPS_DENOMINATOR
  const vipXp = toMoney(
    (theoreticalRake / baseHouseEdgeRate) *
      (normalizedProductXpRateBps / BPS_DENOMINATOR),
  )

  return {
    sourceType,
    wagerAmount: normalizedWager,
    houseEdgeBps: normalizedHouseEdgeBps,
    productXpRateBps: normalizedProductXpRateBps,
    theoreticalRake,
    vipXp,
  }
}

export const calculateFixedHouseEdgeVipEarning = (
  input: FixedHouseEdgeVipEarningInput,
): VipEarning => calculateVipEarning(input)
