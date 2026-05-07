import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsNumber, IsPositive, Max, Min } from 'class-validator'

export class CashoutCrashSessionDto {
  @ApiProperty({ example: 123 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  game_session_id!: number

  @ApiProperty({ example: 1.66 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100000)
  multiplier!: number
}
