import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

import type { VipRewardClaimType } from '../vip-reward-claim.entity'
import type { VipLedgerSourceType } from '../vip-earning.logic'

export const VIP_LEDGER_SOURCE_TYPES: readonly VipLedgerSourceType[] = [
  'case_open',
  'mines_round',
  'crash_round',
  'upgrade_attempt',
  'historical_case_backfill',
] as const

export const VIP_REWARD_CLAIM_TYPES: readonly VipRewardClaimType[] = [
  'cashback',
  'weekly_keys',
  'vip_case_open',
] as const

export class AdminVipLedgerQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number

  @IsOptional()
  @IsIn(VIP_LEDGER_SOURCE_TYPES)
  sourceType?: VipLedgerSourceType

  @IsOptional()
  @IsString()
  search?: string
}

export class AdminVipClaimsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number

  @IsOptional()
  @IsIn(VIP_REWARD_CLAIM_TYPES)
  rewardType?: VipRewardClaimType

  @IsOptional()
  @IsString()
  search?: string
}
