import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateIf,
} from 'class-validator'
import { UPGRADE_LIMITS } from '../upgrade.constants'

// Mode-specific shape: in inventory mode `inventory_skin_ids` is required;
// in balance mode `upgrade_amount` is required. `@ValidateIf` makes class-
// validator enforce this at the request boundary so the controller/service
// don't need to repeat the check.
export class UpgradeDto {
  @ApiPropertyOptional({
    description:
      'ID скинов из инвентаря пользователя для апгрейда (обязательно при use_balance: false)',
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
      'ID скина из маркета, на который производится апгрейд. Обязателен в обоих режимах (как для инвентаря, так и для баланса).',
    example: 456,
  })
  @IsInt()
  @IsPositive()
  target_skin_id!: number

  @ApiPropertyOptional({
    description: 'Использовать деньги с баланса вместо скинов из инвентаря',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  use_balance?: boolean

  @ApiPropertyOptional({
    description:
      'Сумма денег для апгрейда (обязательна и используется только при use_balance: true)',
    example: 500,
    minimum: UPGRADE_LIMITS.MIN_AMOUNT,
    maximum: UPGRADE_LIMITS.MAX_AMOUNT,
  })
  @ValidateIf(o => o.use_balance === true)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(UPGRADE_LIMITS.MIN_AMOUNT)
  @Max(UPGRADE_LIMITS.MAX_AMOUNT)
  upgrade_amount?: number
}
