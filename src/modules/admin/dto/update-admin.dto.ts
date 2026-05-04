import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import { AdminRole } from '../types/admin-role.enum'

// Patch payload for /admin/:id. Email cannot be changed (would
// invalidate audit references); to "change email" you create a new
// admin and disable the old one.
export class UpdateAdminDto {
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
  @IsEnum(AdminRole)
  role?: AdminRole

  @IsOptional()
  @IsBoolean()
  is_active?: boolean

  // Optional password reset (admin-initiated). Same policy as RegisterAdminDto.
  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/\d/, { message: 'Password must contain a digit' })
  @Matches(/[^A-Za-z0-9]/, { message: 'Password must contain a symbol' })
  password?: string
}
