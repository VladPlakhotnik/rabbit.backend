import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export class OpenClickerCaseDto {
  @ApiProperty({
    description: 'How many cases to open in this call (1–5).',
    default: 1,
    minimum: 1,
    maximum: 5,
    required: false,
  })
  @IsOptional()
  // ValidationPipe runs with whitelist + forbidNonWhitelisted (see main.ts)
  // — every accepted field needs at least one validator decorator, otherwise
  // it gets rejected as "should not exist". Type-cast first because the
  // body comes in as JSON: a numeric value parses correctly, but an empty
  // form-data field would arrive as a string.
  @Type(() => Number)
  @IsInt({ message: 'count must be an integer' })
  @Min(1, { message: 'count must be ≥ 1' })
  @Max(5, { message: 'count must be ≤ 5' })
  count?: number
}
