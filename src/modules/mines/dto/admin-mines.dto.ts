import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import type {
  MinesSessionStatus,
  MinesStakeMode,
} from '../entities/mines-session.entity'

export class AdminMinesListQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number

  @ApiPropertyOptional({ example: 'xpuf' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional({ enum: ['active', 'cashed_out', 'lost'] })
  @IsOptional()
  @IsIn(['active', 'cashed_out', 'lost'])
  status?: MinesSessionStatus

  @ApiPropertyOptional({ enum: ['balance', 'inventory'] })
  @IsOptional()
  @IsIn(['balance', 'inventory'])
  stakeMode?: MinesStakeMode

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBet?: number

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBet?: number

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minWin?: number

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxWin?: number

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minMines?: number

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxMines?: number
}
