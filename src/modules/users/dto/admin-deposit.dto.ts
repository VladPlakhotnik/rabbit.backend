import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { UserDepositStatus } from '../user-deposit.entity'

export class AdminDepositListQueryDto {
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

  @ApiPropertyOptional({ example: 'skinsback' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string

  @ApiPropertyOptional({ enum: Object.values(UserDepositStatus) })
  @IsOptional()
  @IsIn(Object.values(UserDepositStatus))
  status?: UserDepositStatus

  @ApiPropertyOptional({ example: 'skinsback' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number
}
