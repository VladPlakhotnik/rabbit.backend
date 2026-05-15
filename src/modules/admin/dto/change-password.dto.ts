import { IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class ChangeAdminPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  current_password!: string

  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  @MaxLength(128)
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/\d/, { message: 'Password must contain a digit' })
  @Matches(/[^A-Za-z0-9]/, { message: 'Password must contain a symbol' })
  new_password!: string
}

