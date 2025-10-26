import { ApiProperty } from '@nestjs/swagger'
import { IsNumber, IsOptional, Min, Max } from 'class-validator'

export class StartGameDto {
  @ApiProperty({
    description: 'Количество мин на поле',
    example: 3,
    minimum: 1,
    maximum: 20,
  })
  @IsNumber()
  @Min(1)
  @Max(20)
  mines_count!: number

  @ApiProperty({
    description: 'ID скина из инвентаря для ставки (опционально)',
    example: 123,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  inventory_skin_id?: number

  @ApiProperty({
    description: 'Сумма ставки с баланса (опционально)',
    example: 100,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  bet_amount?: number
}

