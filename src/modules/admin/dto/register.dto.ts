import {
  IsEmail,
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import { AdminRole } from '../types/admin-role.enum'

// Admin creation payload. Only super_admin can hit the endpoint that
// consumes this DTO — there is intentionally no public registration.
export class RegisterAdminDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @MaxLength(254)
  email!: string

  // Strong password policy:
  //   - 12+ characters
  //   - at least one lowercase, one uppercase, one digit, one symbol
  // Matches the OWASP ASVS L2 baseline.
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @MaxLength(128)
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/\d/, { message: 'Password must contain a digit' })
  @Matches(/[^A-Za-z0-9]/, { message: 'Password must contain a symbol' })
  password!: string

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  first_name!: string

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  last_name!: string

  @IsEnum(AdminRole, { message: 'Role must be one of: super_admin, admin, manager, viewer' })
  role!: AdminRole
}
