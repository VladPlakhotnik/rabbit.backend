import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
} from 'class-validator'
import { UPGRADE_LIMITS } from '../../upgrade/upgrade.constants'
import type { CrashStakeMode } from '../entities/crash-session.entity'

export class StartCrashGameDto {
  @ApiPropertyOptional({
    description: 'Stake mode. If omitted, backend infers it from the payload.',
    enum: ['balance', 'inventory'],
    example: 'balance',
  })
  @IsOptional()
  @IsIn(['balance', 'inventory'])
  mode?: CrashStakeMode

  @ApiPropertyOptional({
    description: 'Balance stake amount per bet slot',
    example: 1,
    minimum: UPGRADE_LIMITS.MIN_AMOUNT,
    maximum: UPGRADE_LIMITS.MAX_AMOUNT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(UPGRADE_LIMITS.MIN_AMOUNT)
  @Max(UPGRADE_LIMITS.MAX_AMOUNT)
  bet_amount?: number

  @ApiPropertyOptional({
    description: 'Inventory row ids used as the total crash stake',
    example: [123, 456],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(UPGRADE_LIMITS.MIN_MATERIALS)
  @ArrayMaxSize(UPGRADE_LIMITS.MAX_MATERIALS)
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  inventory_skin_ids?: number[]

  @ApiPropertyOptional({
    description: 'Number of independent bet slots',
    enum: [1, 2],
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2])
  bet_count?: 1 | 2
}
