import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class UpgradeDto {
  @ApiPropertyOptional({
    description: 'ID скинов из инвентаря пользователя для апгрейда',
    example: [123, 456],
  })
  inventory_skin_ids?: number[]

  @ApiPropertyOptional({
    description: 'ID скина из маркета, на который производится апгрейд',
    example: 456,
  })
  target_skin_id?: number

  @ApiPropertyOptional({
    description: 'Использовать деньги с баланса вместо скина из инвентаря',
    example: false,
  })
  use_balance?: boolean

  @ApiPropertyOptional({
    description:
      'Сумма денег для апгрейда (используется только при use_balance: true)',
    example: 500,
    minimum: 1,
  })
  upgrade_amount?: number
}
