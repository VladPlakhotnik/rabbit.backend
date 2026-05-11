import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateIf,
} from 'class-validator'
import { UPGRADE_LIMITS } from '../upgrade.constants'

export type UpgradeGameType = 'csgo' | 'dota'

// Mode-specific shape: in inventory mode `inventory_skin_ids` is required;
// in balance mode `upgrade_amount` is required. `@ValidateIf` makes class-
// validator enforce this at the request boundary so the controller/service
// don't need to repeat the check.
export class UpgradeDto {
  @ApiPropertyOptional({
    description:
      'User inventory item IDs used as upgrade materials. Required when use_balance is false. Materials may come from any supported game.',
    example: [123, 456],
  })
  @ValidateIf(o => o.use_balance !== true)
  @IsArray()
  @ArrayMinSize(UPGRADE_LIMITS.MIN_MATERIALS)
  @ArrayMaxSize(UPGRADE_LIMITS.MAX_MATERIALS)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  inventory_skin_ids?: number[]

  @ApiProperty({
    description:
      'Target catalog skin ID. The target catalog is selected by game_type.',
    example: 456,
  })
  @IsInt()
  @IsPositive()
  target_skin_id!: number

  @ApiPropertyOptional({
    description: 'Use balance instead of inventory materials.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  use_balance?: boolean

  @ApiPropertyOptional({
    description:
      'Balance amount used for the upgrade. Required and used only when use_balance is true.',
    example: 500,
    minimum: UPGRADE_LIMITS.MIN_AMOUNT,
    maximum: UPGRADE_LIMITS.MAX_AMOUNT,
  })
  @ValidateIf(o => o.use_balance === true)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(UPGRADE_LIMITS.MIN_AMOUNT)
  @Max(UPGRADE_LIMITS.MAX_AMOUNT)
  upgrade_amount?: number

  @ApiProperty({
    description:
      'Target catalog for target_skin_id: "csgo" or "dota". Inventory materials may come from any supported game.',
    enum: ['csgo', 'dota'],
    example: 'csgo',
    default: 'csgo',
  })
  @IsOptional()
  @IsIn(['csgo', 'dota'])
  game_type?: UpgradeGameType
}
