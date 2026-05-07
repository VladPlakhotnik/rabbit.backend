import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
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
import type { MinesStakeMode } from '../entities/mines-session.entity'
import { MAX_MINES, MIN_MINES } from '../mines.constants'

export class StartGameDto {
  @ApiProperty({
    description: 'Number of mines on the 5x5 board',
    example: 3,
    minimum: MIN_MINES,
    maximum: MAX_MINES,
  })
  @Type(() => Number)
  @IsInt()
  @Min(MIN_MINES)
  @Max(MAX_MINES)
  mines_count!: number

  @ApiPropertyOptional({
    description: 'Stake mode. If omitted, backend infers it from the payload.',
    enum: ['balance', 'inventory'],
    example: 'balance',
  })
  @IsOptional()
  @IsIn(['balance', 'inventory'])
  mode?: MinesStakeMode

  @ApiPropertyOptional({
    description: 'Inventory row ids used as the stake',
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
    description: 'Legacy single inventory row id used as the stake',
    example: 123,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  inventory_skin_id?: number

  @ApiPropertyOptional({
    description: 'Balance stake amount',
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
}
