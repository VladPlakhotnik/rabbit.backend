import { ApiProperty } from '@nestjs/swagger'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator'

// Request body for `POST /withdraw/steam-skins`. Game type is inferred
// from the inventory rows themselves (all must share one), so the
// caller doesn't pass it explicitly — keeps the API minimal and
// prevents game/items mismatch from being a separate failure mode.
export class RequestWithdrawalDto {
  @ApiProperty({
    description: 'IDs of inventory items to withdraw (all must be from one game).',
    example: [123, 456],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  inventory_ids!: number[]

  @ApiProperty({
    description:
      'Steam trade-offer URL of the form ' +
      '"https://steamcommunity.com/tradeoffer/new/?partner=...&token=...". ' +
      'Validated server-side; bad URLs return 400 before any TM call.',
    example: 'https://steamcommunity.com/tradeoffer/new/?partner=12345678&token=ABCDEFGH',
  })
  @IsString()
  @MaxLength(512)
  trade_url!: string
}
