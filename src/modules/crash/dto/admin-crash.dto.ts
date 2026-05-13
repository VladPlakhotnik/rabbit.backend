import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator'
import type {
  CrashSessionStatus,
  CrashStakeMode,
} from '../entities/crash-session.entity'

export class AdminCrashListQueryDto {
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

  @ApiPropertyOptional({ enum: ['active', 'cashed_out', 'crashed'] })
  @IsOptional()
  @IsIn(['active', 'cashed_out', 'crashed'])
  status?: CrashSessionStatus

  @ApiPropertyOptional({ enum: ['balance', 'inventory'] })
  @IsOptional()
  @IsIn(['balance', 'inventory'])
  stakeMode?: CrashStakeMode

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
  minStake?: number

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxStake?: number

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

  @ApiPropertyOptional({ example: 1.1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minMultiplier?: number

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxMultiplier?: number
}
