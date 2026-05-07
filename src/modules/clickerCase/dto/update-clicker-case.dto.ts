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

export class UpdateClickerCaseDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  image_url?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  case_price?: number

  @ApiProperty({ enum: ['csgo', 'dota'], required: false })
  @IsOptional()
  @IsIn(['csgo', 'dota'])
  game_type?: 'csgo' | 'dota'

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_popular?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_limited?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_available?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  remaining_count?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_count?: number
}
