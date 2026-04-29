import { ApiProperty } from '@nestjs/swagger'

export class GlobalStatsDto {
  @ApiProperty({
    description:
      'Distinct users who logged any activity in the last 15 minutes.',
    example: 1698,
  })
  online!: number

  @ApiProperty({
    description: 'Total number of registered users.',
    example: 1091561,
  })
  players!: number

  @ApiProperty({
    description: 'Total games played (case openings + upgrade attempts).',
    example: 34091561,
  })
  totalGames!: number

  @ApiProperty({
    description:
      'Total amount won by users — sum of skin prices from case drops and successful upgrades.',
    example: 87014956,
  })
  won!: number
}
