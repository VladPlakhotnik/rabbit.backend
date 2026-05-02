import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

/**
 * Single-field payload for the Mini App auth endpoint.
 *
 * `initData` is the verbatim query-string Telegram exposes via
 * `window.Telegram.WebApp.initData` — keep it untouched on the frontend so
 * the HMAC matches. Decoding / mutating it before POST will silently break
 * verification.
 */
export class TelegramMiniAppDto {
  @ApiProperty({
    description:
      'Raw initData query string from window.Telegram.WebApp.initData. Send as-is, do not decode.',
  })
  @IsString()
  @IsNotEmpty()
  initData!: string
}
