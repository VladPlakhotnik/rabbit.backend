import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class CreateClickerEnergyLevelDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  level!: number

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  image_url!: string

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  energy_amount!: number

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  upgrade_cost!: number

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  regen_per_sec_milli?: number
}

export class UpdateClickerEnergyLevelDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  image_url?: string

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  energy_amount?: number

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  upgrade_cost?: number

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  regen_per_sec_milli?: number
}
