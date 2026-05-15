import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { PLAYER_ROLE_VALUES } from '../player-role.enum'
import { USER_BLOCK_REASON_TEMPLATES } from '../user-block'

export class AdminUserListQueryDto {
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
  @MaxLength(120)
  search?: string

  @IsOptional()
  @IsString()
  @IsIn(PLAYER_ROLE_VALUES)
  @MaxLength(50)
  role?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBalance?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBalance?: number
}

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  display_name?: string

  @IsOptional()
  @IsString()
  @IsIn(PLAYER_ROLE_VALUES)
  @MaxLength(50)
  role?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  balance?: number

  @IsOptional()
  @IsString()
  @MaxLength(255)
  avatar?: string

  @IsOptional()
  @IsString()
  @MaxLength(512)
  trade_link?: string | null

  @IsOptional()
  @IsBoolean()
  telegram_bonus_claimed?: boolean

  @IsOptional()
  @IsBoolean()
  discord_bonus_claimed?: boolean
}

export class AdminBlockUserDto {
  @IsOptional()
  @IsString()
  @IsIn(USER_BLOCK_REASON_TEMPLATES)
  @MaxLength(64)
  template?: string

  @IsString()
  @MaxLength(500)
  reason!: string
}
