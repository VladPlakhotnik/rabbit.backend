import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator'

export type AdminCaseStatusFilter = 'all' | 'active' | 'disabled'
export type AdminCaseGameFilter = 'all' | 'csgo' | 'dota'

export class CreateCaseDto {
  @ApiProperty({ description: 'URL-safe slug, e.g. "fracture-case"' })
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string

  @ApiProperty({ description: 'Display name' })
  @IsString()
  @MaxLength(100)
  name!: string

  @ApiProperty({ description: 'Case artwork URL' })
  @IsString()
  @MaxLength(255)
  img_url!: string

  @ApiProperty({ enum: ['csgo', 'dota'], default: 'csgo' })
  @IsIn(['csgo', 'dota'])
  game_type!: 'csgo' | 'dota'

  @ApiProperty({ description: 'Open price in USD balance' })
  @IsNumber()
  @Min(0)
  case_price!: number

  @ApiProperty({ description: 'Current supply for limited cases' })
  @IsInt()
  @Min(0)
  remaining_count!: number

  @ApiProperty({ description: 'Original supply for limited cases' })
  @IsInt()
  @Min(0)
  max_count!: number

  @ApiProperty({ default: false })
  @IsBoolean()
  is_popular!: boolean

  @ApiProperty({ default: false })
  @IsBoolean()
  is_limited!: boolean

  @ApiProperty({ default: true })
  @IsBoolean()
  is_available!: boolean

  @ApiProperty({ description: 'Section id this case belongs to' })
  @IsInt()
  @Min(1)
  section_id!: number
}

export class UpdateCaseDto {
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
  @MaxLength(255)
  img_url?: string

  @ApiProperty({ enum: ['csgo', 'dota'], required: false })
  @IsOptional()
  @IsIn(['csgo', 'dota'])
  game_type?: 'csgo' | 'dota'

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  case_price?: number

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
  @Min(1)
  section_id?: number
}

export class AdminCaseListQueryDto {
  @ApiProperty({ enum: ['all', 'active', 'disabled'], required: false })
  @IsOptional()
  @IsIn(['all', 'active', 'disabled'])
  status?: AdminCaseStatusFilter

  @ApiProperty({ enum: ['all', 'csgo', 'dota'], required: false })
  @IsOptional()
  @IsIn(['all', 'csgo', 'dota'])
  game_type?: AdminCaseGameFilter

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  section_id?: number
}

export class CreateCaseSkinDto {
  @ApiProperty({
    description: 'Skin market_hash_name from the matching game catalog',
  })
  @IsString()
  @MaxLength(255)
  market_hash_name!: string

  @ApiProperty({ description: 'Drop chance in percent', default: 1 })
  @IsNumber()
  @Min(0)
  chance!: number

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  is_drop_out?: boolean
}

export class UpdateCaseSkinDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  chance?: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_drop_out?: boolean
}
