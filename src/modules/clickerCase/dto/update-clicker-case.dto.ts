import { ApiProperty } from '@nestjs/swagger'

export class UpdateClickerCaseDto {
  @ApiProperty({ required: false })
  slug?: string

  @ApiProperty({ required: false })
  name?: string

  @ApiProperty({ required: false })
  description?: string

  @ApiProperty({ required: false })
  image_url?: string

  @ApiProperty({ required: false })
  case_price?: number

  @ApiProperty({ required: false })
  is_popular?: boolean

  @ApiProperty({ required: false })
  is_limited?: boolean

  @ApiProperty({ required: false })
  remaining_count?: number

  @ApiProperty({ required: false })
  max_count?: number
}
