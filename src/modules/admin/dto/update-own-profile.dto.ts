import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator'
import { ADMIN_AVATAR_BASE64_MAX_LENGTH } from '../utils/admin-profile'

export class UpdateOwnAdminProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  first_name?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  last_name?: string

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(ADMIN_AVATAR_BASE64_MAX_LENGTH)
  avatar_url?: string | null
}
