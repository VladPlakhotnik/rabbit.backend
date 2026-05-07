import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import type { CrashAutoBetRoundAction } from '../entities/crash-auto-bet.entity'

export const CRASH_AUTO_BET_ACTIONS = [
  'reset_to_initial',
  'keep_current',
  'increase_50',
  'double',
  'stop_strategy',
] as const

export class CreateCrashAutoBetDto {
  @ApiProperty({ example: 'Safe x2' })
  @IsString()
  @MaxLength(80)
  name!: string

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1.01)
  @Max(10000)
  auto_cashout_multiplier!: number

  @ApiProperty({ example: 0.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(5000)
  initial_bet!: number

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(5000)
  max_bet!: number

  @ApiProperty({ enum: CRASH_AUTO_BET_ACTIONS, example: 'reset_to_initial' })
  @IsIn(CRASH_AUTO_BET_ACTIONS)
  on_win_action!: CrashAutoBetRoundAction

  @ApiProperty({ enum: CRASH_AUTO_BET_ACTIONS, example: 'keep_current' })
  @IsIn(CRASH_AUTO_BET_ACTIONS)
  on_loss_action!: CrashAutoBetRoundAction

  @ApiProperty({ enum: CRASH_AUTO_BET_ACTIONS, example: 'reset_to_initial' })
  @IsIn(CRASH_AUTO_BET_ACTIONS)
  on_max_bet_action!: CrashAutoBetRoundAction
}

export class UpdateCrashAutoBetDto {
  @ApiPropertyOptional({ example: 'Safe x2' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1.01)
  @Max(10000)
  auto_cashout_multiplier?: number

  @ApiPropertyOptional({ example: 0.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(5000)
  initial_bet?: number

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(5000)
  max_bet?: number

  @ApiPropertyOptional({ enum: CRASH_AUTO_BET_ACTIONS })
  @IsOptional()
  @IsIn(CRASH_AUTO_BET_ACTIONS)
  on_win_action?: CrashAutoBetRoundAction

  @ApiPropertyOptional({ enum: CRASH_AUTO_BET_ACTIONS })
  @IsOptional()
  @IsIn(CRASH_AUTO_BET_ACTIONS)
  on_loss_action?: CrashAutoBetRoundAction

  @ApiPropertyOptional({ enum: CRASH_AUTO_BET_ACTIONS })
  @IsOptional()
  @IsIn(CRASH_AUTO_BET_ACTIONS)
  on_max_bet_action?: CrashAutoBetRoundAction
}
