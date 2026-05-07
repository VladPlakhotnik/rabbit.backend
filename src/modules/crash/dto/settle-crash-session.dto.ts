import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsPositive } from 'class-validator'

export class SettleCrashSessionDto {
  @ApiProperty({ example: 123 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  game_session_id!: number
}
