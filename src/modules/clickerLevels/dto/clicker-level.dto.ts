import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class CreateClickerLevelDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  level!: number

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  image_url!: string

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  points_required!: number
}

export class UpdateClickerLevelDto {
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

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  points_required?: number
}
