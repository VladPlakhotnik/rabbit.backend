import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Max, Min } from 'class-validator'

export class MakeMoveDto {
  @ApiProperty({
    description: 'Mines game session id',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  game_session_id!: number

  @ApiProperty({
    description: 'Cell X coordinate (0-4)',
    example: 2,
    minimum: 0,
    maximum: 4,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  x!: number

  @ApiProperty({
    description: 'Cell Y coordinate (0-4)',
    example: 3,
    minimum: 0,
    maximum: 4,
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  y!: number
}
