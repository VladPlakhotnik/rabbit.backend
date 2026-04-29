import { ApiProperty } from '@nestjs/swagger'
import { IsString, Length, Matches } from 'class-validator'

export class HeartbeatDto {
  @ApiProperty({
    description:
      'Client-generated id (UUID v4) persisted in localStorage. ' +
      'Same id from multiple tabs of the same browser dedupes to one online user.',
    example: 'a1b2c3d4-1234-5678-9012-abcdef012345',
  })
  @IsString()
  // UUID-like shape: 8-4-4-4-12 hex chars. We don't enforce the version nibble
  // strictly (different libs in the wild emit v1/v4/v7), only the hex layout —
  // it's enough to keep arbitrary keys / injection attempts out.
  @Matches(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, {
    message: 'id must be a UUID',
  })
  @Length(36, 36)
  id!: string
}
