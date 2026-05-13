import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import {
  WithdrawalGameType,
  WithdrawalStatus,
} from '../withdrawal.entity'

export class AdminWithdrawalListQueryDto {
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
  @Max(100)
  limit?: number

  @ApiPropertyOptional({ example: 'AK-47' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string

  @ApiPropertyOptional({ enum: Object.values(WithdrawalStatus) })
  @IsOptional()
  @IsIn(Object.values(WithdrawalStatus))
  status?: WithdrawalStatus

  @ApiPropertyOptional({ enum: ['csgo', 'dota'] })
  @IsOptional()
  @IsIn(['csgo', 'dota'])
  gameType?: WithdrawalGameType

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number

  @ApiPropertyOptional({ example: 77 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  inventoryItemId?: number

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minTargetPrice?: number

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxTargetPrice?: number

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minActualPrice?: number

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxActualPrice?: number
}
