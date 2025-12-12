import { ApiProperty } from '@nestjs/swagger'
import { IsNumber } from 'class-validator'

export class CashoutDto {
  @ApiProperty({
    description: 'ID игровой сессии',
    example: 1,
  })
  @IsNumber()
  game_session_id!: number
}

