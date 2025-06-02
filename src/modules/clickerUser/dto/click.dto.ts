import { ApiProperty } from '@nestjs/swagger'
import { ClickerLevel } from '../../clickerLevels/entities/clicker_level.entity'
import { ClickerClickLevel } from '../../clickerClickLevels/entities/clicker_click_level.entity'
import { ClickerEnergyLevel } from '../../clickerEnergyLevels/entities/clicker_energy_level.entity'

export class ClickDto {
  @ApiProperty({ description: 'ID user' })
  user_id!: number
}

export class ClickResponseDto {
  @ApiProperty()
  points!: number

  @ApiProperty()
  energy_amount!: number

  @ApiProperty()
  reward!: number

  @ApiProperty()
  level!: ClickerLevel

  @ApiProperty()
  click_level!: ClickerClickLevel

  @ApiProperty()
  energy_level!: ClickerEnergyLevel

  @ApiProperty()
  next_energy_update!: Date
}
