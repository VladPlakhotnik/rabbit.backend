import { ApiProperty } from '@nestjs/swagger'

export class UserStatsDto {
  @ApiProperty({
    description:
      'Total games played by the user — boxes opened (counting each ' +
      'box in a multi-open) plus all upgrade attempts (success or fail).',
    example: 42,
  })
  gamesPlayed!: number

  @ApiProperty({
    description:
      'Total amount won — sum of skin prices from every case drop plus ' +
      'sum of skin prices from successful upgrades.',
    example: 1234.56,
  })
  totalWon!: number

  @ApiProperty({
    description:
      'Single most expensive skin won by the user — the max across case ' +
      'drops and successful upgrades. 0 if the user has not won anything yet.',
    example: 489.99,
  })
  topWin!: number
}
