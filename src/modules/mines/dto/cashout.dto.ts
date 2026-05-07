import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt } from 'class-validator'

export class CashoutDto {
  @ApiProperty({
    description: 'Mines game session id',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  game_session_id!: number
}
