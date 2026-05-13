import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'

export type AdminNotificationTargetFilter = 'all' | 'global' | 'user'

const toOptionalBoolean = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return value
}

export class AdminNotificationListQueryDto {
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
  @IsIn(['all', 'global', 'user'])
  target?: AdminNotificationTargetFilter

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  important?: boolean

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  viewed?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(120)
  i18nKey?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number
}

export class AdminNotificationPayloadDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  i18n_key?: string | null

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsObject()
  i18n_params?: Record<string, string | number | boolean | null> | null

  @IsOptional()
  @IsBoolean()
  is_important?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  user_id?: number | null
}
