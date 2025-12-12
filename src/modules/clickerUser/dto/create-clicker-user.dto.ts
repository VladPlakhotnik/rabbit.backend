import { ApiProperty } from '@nestjs/swagger'

export class CreateClickerUserDto {
  @ApiProperty({ description: 'ID user' })
  user_id!: number

  @ApiProperty({ description: 'Initial level', default: 1 })
  level: number = 1

  @ApiProperty({ description: 'Initial click level', default: 1 })
  click_level: number = 1

  @ApiProperty({ description: 'Initial energy level', default: 1 })
  energy_level: number = 1

  @ApiProperty({ description: 'Initial energy amount', default: 10 })
  energy_amount: number = 10

  @ApiProperty({ description: 'Initial points amount', default: 0 })
  points: number = 0
}
