import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString } from 'class-validator'

/**
 * Payload posted by the frontend when an already-logged-in user links
 * their Telegram account. Mirrors the keys Telegram's Login Widget
 * delivers, so the same hash check that runs on first-time sign-in works
 * here too.
 *
 * The endpoint that consumes this DTO is JWT-protected — the user the
 * link applies to is read from `req.user.id`, never from the body. The
 * caller cannot specify which account the Telegram id attaches to.
 */
export class LinkTelegramDto {
  @ApiProperty({ description: 'Telegram user id' })
  @Type(() => Number)
  @IsInt()
  id!: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  first_name?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  last_name?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  username?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  photo_url?: string

  @ApiProperty({ description: 'Unix seconds when Telegram signed the payload' })
  @Type(() => Number)
  @IsInt()
  auth_date!: number

  @ApiProperty({ description: 'HMAC-SHA256 of the payload' })
  @IsString()
  hash!: string
}
