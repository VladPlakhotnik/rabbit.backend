import { ApiProperty } from '@nestjs/swagger'

export class CreateClickerCaseDto {
  @ApiProperty({ description: 'URL-safe slug, e.g. "rabbit-starter"' })
  slug!: string

  @ApiProperty({ description: 'Display name' })
  name!: string

  @ApiProperty({ description: 'Marketing copy (optional)', required: false })
  description?: string

  @ApiProperty({ description: 'CDN URL for the case artwork' })
  image_url!: string

  @ApiProperty({ description: 'Price in clicker points (carrots)' })
  case_price!: number

  @ApiProperty({ default: false, required: false })
  is_popular?: boolean

  @ApiProperty({ default: false, required: false })
  is_limited?: boolean

  @ApiProperty({ default: 0, required: false })
  remaining_count?: number

  @ApiProperty({ default: 0, required: false })
  max_count?: number
}
