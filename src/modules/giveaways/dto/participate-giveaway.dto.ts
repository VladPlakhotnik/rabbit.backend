import { ApiProperty } from '@nestjs/swagger'
import { IsNumber } from 'class-validator'

export class ParticipateGiveawayDto {
  @ApiProperty({
    description: 'ID розыгрыша для участия',
    example: 1,
  })
  @IsNumber()
  giveaway_id!: number
}
