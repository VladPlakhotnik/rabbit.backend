import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

// Trimmed shape that the profile history table consumes — the raw
// `upgrade_history` row carries fields the table doesn't render
// (`skin_name`, `old_rarity`, `materials`, etc.). Returning a DTO instead of
// the entity keeps the contract narrow and lets the frontend type its row
// without optional-everything pain.
export class UpgradeHistoryItemDto {
  @ApiProperty({ example: 42 })
  id!: number

  @ApiProperty({
    description: 'How much the user paid (sum of materials or balance debit)',
    example: 12.5,
  })
  cost!: number

  @ApiProperty({
    description: 'Server-authoritative chance the upgrade was rolled against',
    example: 41.67,
  })
  chance!: number

  @ApiProperty({
    description: 'Snapshot of the target skin price at upgrade time',
    example: 30,
  })
  skin_price!: number

  @ApiProperty({
    description: 'true = roll succeeded and the prize is in the inventory',
    example: false,
  })
  success!: boolean

  @ApiPropertyOptional({
    description:
      'Target skin id — handy for linking to the skin page. Kept optional ' +
      'because the row stays valid even after the skin is removed from the ' +
      'catalog.',
    example: 1234,
  })
  skin_id?: number

  @ApiProperty({ example: '2026-04-27T12:00:00.000Z' })
  created_at!: Date
}
