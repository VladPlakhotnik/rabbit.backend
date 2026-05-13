import { ApiProperty } from '@nestjs/swagger'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'
import { SkinStatus } from '../shared/skin-status.enum'

const STATUS_VALUES = [
  SkinStatus.Available,
  SkinStatus.UnavailableOnMarket,
  SkinStatus.Disabled,
] as const

export class BaseAdminSkinDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  image?: string

  @ApiProperty({ enum: STATUS_VALUES, required: false })
  @IsOptional()
  @IsIn(STATUS_VALUES)
  status?: SkinStatus

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  market_price?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  raw_market_price?: number | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  amount_in_market?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  inspect_in_game?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name_color?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  background_color?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  quality?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  rarity?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  item_type?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  collection?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_new?: boolean

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  buy_order?: number | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  avg_price?: number | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  popularity_7d?: number | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  ru_name?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ru_quality?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phase?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  exterior?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  hero?: string | null

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  slot?: string | null
}

export class CreateAdminSkinDto extends BaseAdminSkinDto {
  @ApiProperty({ enum: ['csgo', 'dota'] })
  @IsIn(['csgo', 'dota'])
  game_type!: 'csgo' | 'dota'

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  market_hash_name!: string
}

export class UpdateAdminSkinDto extends BaseAdminSkinDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  market_hash_name?: string
}

export class UpdateAdminSkinStatusDto {
  @ApiProperty({ enum: STATUS_VALUES })
  @IsIn(STATUS_VALUES)
  status!: SkinStatus
}
