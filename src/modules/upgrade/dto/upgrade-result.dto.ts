import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { CsgoSkin } from '../../skins/csgo-skin.entity'

// Response shape for `POST /upgrade`. Mirrors the runtime contract built in
// `UpgradeService.buildUpgradeResult`. Used both for typing the service return
// and for documenting the endpoint via `@ApiResponse({ type: UpgradeResultDto })`.
export class UpgradeResultDto {
  @ApiProperty({
    description: 'Whether the upgrade roll succeeded',
    example: true,
  })
  success!: boolean

  @ApiPropertyOptional({
    description: 'The upgraded skin (present only on win)',
    type: () => CsgoSkin,
  })
  upgraded_skin?: CsgoSkin

  @ApiPropertyOptional({
    description:
      'ID of the freshly created `user_inventory` row (present only on win). The frontend uses this to wire the Sell button — selling is by inventory id, not by skin id.',
    example: 9182,
  })
  upgraded_inventory_id?: number

  @ApiProperty({
    description:
      'Server-authoritative chance the upgrade was rolled against (0..100), rounded to two decimals.',
    example: 42.86,
    minimum: 0,
    maximum: 100,
  })
  chance!: number

  @ApiProperty({
    description:
      'Actual random value rolled (0..100). The frontend uses this to land the wheel pointer on the exact percentage that came up.',
    example: 71.23,
    minimum: 0,
    maximum: 100,
  })
  roll!: number

  @ApiPropertyOptional({
    description:
      'New balance after the upgrade — present only when `use_balance: true` was sent.',
    example: 1234.56,
  })
  new_balance?: number
}
