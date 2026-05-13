import { Transform, Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import {
  PromoCodeStatus,
  PromoCodeType,
} from '../../promoCodes/entities/promoCode.entity'
import { RewardType as PromoRewardType } from '../../promoCodes/entities/promoCodeReward.entity'
import { RewardType } from '../../rewards/enums/reward-type.enum'

export type AdminRewardActiveFilter = 'all' | boolean
export type AdminRewardGameFilter = 'all' | 'csgo' | 'dota'
export type AdminPromoCodeStatusFilter = 'all' | PromoCodeStatus
export type AdminPromoCodeTypeFilter = 'all' | PromoCodeType
export type AdminPromoCodeRewardTypeFilter = 'all' | PromoRewardType
export type AdminRewardTypeFilter = 'all' | RewardType

const toOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return value
}

export class AdminPromoCodeListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string

  @IsOptional()
  @IsIn(['all', ...Object.values(PromoCodeStatus)])
  status?: AdminPromoCodeStatusFilter

  @IsOptional()
  @IsIn(['all', ...Object.values(PromoCodeType)])
  type?: AdminPromoCodeTypeFilter

  @IsOptional()
  @IsIn(['all', ...Object.values(PromoRewardType)])
  rewardType?: AdminPromoCodeRewardTypeFilter
}

export class AdminPromoCodeRewardDto {
  @IsIn(Object.values(PromoRewardType))
  reward_type!: PromoRewardType

  @IsNumber()
  @Min(0)
  value!: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  skin_id?: number | null

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_deposit?: number | null

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_bonus?: number | null

  @IsOptional()
  @IsBoolean()
  is_demo?: boolean
}

export class CreateAdminPromoCodeDto {
  @IsString()
  @MaxLength(50)
  code!: string

  @IsIn(Object.values(PromoCodeType))
  type!: PromoCodeType

  @IsOptional()
  @IsIn(Object.values(PromoCodeStatus))
  status?: PromoCodeStatus

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  max_uses?: number | null

  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsDateString()
  expires_at?: string | null

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdminPromoCodeRewardDto)
  rewards!: AdminPromoCodeRewardDto[]
}

export class UpdateAdminPromoCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string

  @IsOptional()
  @IsIn(Object.values(PromoCodeType))
  type?: PromoCodeType

  @IsOptional()
  @IsIn(Object.values(PromoCodeStatus))
  status?: PromoCodeStatus

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  max_uses?: number | null

  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsDateString()
  expires_at?: string | null

  @IsOptional()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdminPromoCodeRewardDto)
  rewards?: AdminPromoCodeRewardDto[]
}

export class AdminRewardListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string

  @IsOptional()
  @IsIn(['all', ...Object.values(RewardType)])
  type?: AdminRewardTypeFilter

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsIn(['all', 'csgo', 'dota'])
  game_type?: AdminRewardGameFilter
}

export class CreateAdminRewardDto {
  @IsIn(Object.values(RewardType))
  type!: RewardType

  @IsString()
  @MaxLength(255)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  @IsNumber()
  @Min(0)
  value!: number

  @IsNumber()
  @Min(0)
  drop_chance!: number

  @IsOptional()
  @IsBoolean()
  is_active?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  case_id?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  csgo_skin_id?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dota_skin_id?: number | null

  @IsOptional()
  @IsIn(['csgo', 'dota'])
  game_type?: 'csgo' | 'dota' | null
}

export class UpdateAdminRewardDto {
  @IsOptional()
  @IsIn(Object.values(RewardType))
  type?: RewardType

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number

  @IsOptional()
  @IsNumber()
  @Min(0)
  drop_chance?: number

  @IsOptional()
  @IsBoolean()
  is_active?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  case_id?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  csgo_skin_id?: number | null

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dota_skin_id?: number | null

  @IsOptional()
  @IsIn(['csgo', 'dota'])
  game_type?: 'csgo' | 'dota' | null
}
