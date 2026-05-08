import { ApiProperty } from '@nestjs/swagger'

// Response shape for `GET /upgrade/limits`. Mirrors `UPGRADE_LIMITS` and is
// the single contract the frontend reads to drive UI bounds (button enabled
// state, market card filtering, materials counter, balance input min/max).
export class UpgradeLimitsDto {
  @ApiProperty({
    description: 'Minimum allowed rolled chance (inclusive, percent)',
    example: 1,
  })
  min_chance!: number

  @ApiProperty({
    description: 'Maximum allowed rolled chance (inclusive, percent)',
    example: 80,
  })
  max_chance!: number

  @ApiProperty({
    description:
      'Minimum source value in account currency. Applies to `upgrade_amount` (balance mode) and Σ of material prices (inventory mode).',
    example: 0.5,
  })
  min_amount!: number

  @ApiProperty({
    description:
      'Maximum source value in account currency. Applies to `upgrade_amount` (balance mode) and Σ of material prices (inventory mode).',
    example: 5000,
  })
  max_amount!: number

  @ApiProperty({
    description: 'Minimum number of inventory items per upgrade',
    example: 1,
  })
  min_materials!: number

  @ApiProperty({
    description:
      'Maximum number of inventory items per upgrade (technical safety cap)',
    example: 20,
  })
  max_materials!: number

  @ApiProperty({
    description: 'Upgrade return-to-player multiplier used in chance formula',
    example: 0.96,
  })
  house_return!: number
}
