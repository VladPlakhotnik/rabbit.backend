import { ApiProperty } from '@nestjs/swagger'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator'

export class CreateClickerCaseDto {
  @ApiProperty({ description: 'URL-safe slug, e.g. "rabbit-starter"' })
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string

  @ApiProperty({ description: 'Display name' })
  @IsString()
  @MaxLength(100)
  name!: string

  @ApiProperty({ description: 'Marketing copy (optional)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiProperty({ description: 'CDN URL for the case artwork' })
  @IsString()
  @MaxLength(255)
  image_url!: string

  @ApiProperty({ description: 'Price in clicker points (carrots)' })
  @IsInt()
  @Min(0)
  case_price!: number

  @ApiProperty({ enum: ['csgo', 'dota'], default: 'csgo', required: false })
  @IsOptional()
  @IsIn(['csgo', 'dota'])
  game_type?: 'csgo' | 'dota'

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  is_popular?: boolean

  @ApiProperty({ default: false, required: false })
  @IsOptional()
  @IsBoolean()
  is_limited?: boolean

  @ApiProperty({ default: true, required: false })
  @IsOptional()
  @IsBoolean()
  is_available?: boolean

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  remaining_count?: number

  @ApiProperty({ default: 0, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_count?: number
}
