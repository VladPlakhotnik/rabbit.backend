import { ApiProperty } from '@nestjs/swagger'
import { ClickerLevel } from '../../clickerLevels/entities/clicker_level.entity'
import { ClickerClickLevel } from '../../clickerClickLevels/entities/clicker_click_level.entity'
import { ClickerEnergyLevel } from '../../clickerEnergyLevels/entities/clicker_energy_level.entity'

/**
 * Batched click message. The frontend coalesces local clicks for ~150ms and
 * ships them in one event so a session of intensive clicking produces a few
 * messages per second instead of dozens.
 *
 * `user_id` is intentionally absent — the gateway resolves it from the JWT
 * passed in the websocket handshake. Clients can never act on someone else's
 * profile.
 */
export class ClickBatchDto {
  @ApiProperty({
    description: 'Number of clicks accumulated since last batch',
    minimum: 1,
    example: 5,
  })
  count!: number

  @ApiProperty({
    description: 'Client timestamp (ms) when the batch was sent',
    required: false,
  })
  ts?: number
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
