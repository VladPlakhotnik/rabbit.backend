import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import type { NewsContentBlock } from '../entities/news.entity'

export type AdminNewsContentType = NewsContentBlock['type']

export class AdminNewsListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string
}

export class AdminNewsContentBlockDto implements NewsContentBlock {
  @IsIn(['title', 'text', 'image', 'video', 'link', 'list'])
  type!: AdminNewsContentType

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  url?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  alt?: string
}

export class CreateNewsDto {
  @IsString()
  @MaxLength(255)
  slug!: string

  @IsString()
  @MaxLength(255)
  title!: string

  @IsString()
  @MaxLength(255)
  category!: string

  @IsString()
  @MaxLength(1024)
  preview_image!: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdminNewsContentBlockDto)
  content!: AdminNewsContentBlockDto[]
}

export class UpdateNewsDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  preview_image?: string

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdminNewsContentBlockDto)
  content?: AdminNewsContentBlockDto[]
}
