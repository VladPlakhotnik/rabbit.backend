import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { UpgradeMode } from '../entities/upgrade-history.entity'

// One material that was sacrificed for the upgrade. Comes from the JSONB
// snapshot in `upgrade_history.materials`, plus an optional `image` joined
// from the live `csgo_skins` row by `skin_id`. `image` is nullable because
// the source skin can be removed from the catalog after the upgrade — the
// row itself stays correct, the picture just won't be there.
export class UpgradeMaterialDetailDto {
  @ApiProperty({ example: 1234 })
  skin_id!: number

  @ApiProperty({ example: 'AK-47 | Redline (Field-Tested)' })
  name!: string

  @ApiProperty({ example: 'Classified' })
  rarity!: string

  @ApiProperty({ example: 12.5 })
  price!: number

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/skins/ak47-redline.png',
    description: 'null when the source skin was removed from the catalog',
    nullable: true,
  })
  image!: string | null
}

export class UpgradeTargetDetailDto {
  @ApiProperty({ example: 5678 })
  id!: number

  @ApiProperty({ example: 'AWP | Asiimov (Field-Tested)' })
  name!: string

  @ApiProperty({ example: 'Covert' })
  rarity!: string

  @ApiProperty({
    example: 30,
    description: 'Snapshot of the price at upgrade time, not the live price',
  })
  price!: number

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/skins/awp-asiimov.png',
    nullable: true,
  })
  image!: string | null
}

export class UpgradeHistoryDetailDto {
  @ApiProperty({ example: 42 })
  id!: number

  @ApiProperty({ example: 12.5 })
  cost!: number

  @ApiProperty({ example: 41.67 })
  chance!: number

  @ApiProperty({ example: 30 })
  skin_price!: number

  @ApiProperty({
    example: 2.4,
    description:
      'skin_price / cost — the multiplier shown next to the user nick in ' +
      'the Figma modal. 0 when cost is 0 (defensive — should not happen ' +
      'with a valid row).',
  })
  multiplier!: number

  @ApiProperty({ example: false })
  success!: boolean

  @ApiProperty({ example: 'inventory', enum: ['inventory', 'balance'] })
  mode!: UpgradeMode

  @ApiProperty({ example: '2026-04-27T12:00:00.000Z' })
  created_at!: Date

  @ApiProperty({ type: UpgradeTargetDetailDto })
  target!: UpgradeTargetDetailDto

  @ApiProperty({
    type: [UpgradeMaterialDetailDto],
    description:
      'Empty array in balance mode — the source was raw balance, not skins.',
  })
  materials!: UpgradeMaterialDetailDto[]
}
