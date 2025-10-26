import { ApiProperty } from '@nestjs/swagger'
import { IsNumber, Min, Max } from 'class-validator'

export class MakeMoveDto {
  @ApiProperty({
    description: 'ID игровой сессии',
    example: 1,
  })
  @IsNumber()
  game_session_id!: number

  @ApiProperty({
    description: 'X координата клетки (0-4)',
    example: 2,
    minimum: 0,
    maximum: 4,
  })
  @IsNumber()
  @Min(0)
  @Max(4)
  x!: number

  @ApiProperty({
    description: 'Y координата клетки (0-4)',
    example: 3,
    minimum: 0,
    maximum: 4,
  })
  @IsNumber()
  @Min(0)
  @Max(4)
  y!: number
}

