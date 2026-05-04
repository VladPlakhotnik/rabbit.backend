import { IsString, Length, Matches } from 'class-validator'

// Wrapper for any endpoint that consumes a 6-digit TOTP code from the
// authenticated admin (verify-setup, disable). Kept as a dedicated DTO
// so the validation rule lives in one place.
export class TotpCodeDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string
}
