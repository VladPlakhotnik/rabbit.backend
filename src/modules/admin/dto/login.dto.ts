import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator'

export class LoginDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @MaxLength(254)
  email!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(128) // upper bound to avoid bcrypt DoS via huge inputs
  password!: string

  // Optional on first POST. The server replies with `totp_required:
  // true` (HTTP 401 + body shape) when the account has 2FA on and
  // this field is missing, prompting the client to ask for the code
  // and POST again. 6 digits is the TOTP standard.
  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'totp_code must be 6 digits' })
  totp_code?: string
}
