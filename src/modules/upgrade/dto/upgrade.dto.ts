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
  Min,
} from 'class-validator'

export class UpgradeDto {
  @ApiPropertyOptional({
    description:
      'ID скинов из инвентаря пользователя для апгрейда (обязательно при use_balance: false)',
    example: [123, 456],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
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
    minimum: 1,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  upgrade_amount?: number
}
