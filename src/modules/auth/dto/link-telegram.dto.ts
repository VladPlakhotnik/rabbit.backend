import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString } from 'class-validator'

export class LinkTelegramDto {
  @ApiProperty({ description: 'Telegram user id' })
  @Type(() => Number)
  @IsInt()
  id!: number

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  first_name?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  last_name?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  username?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  photo_url?: string

  @ApiProperty({ description: 'Unix seconds when Telegram signed the payload' })
  @Type(() => Number)
  @IsInt()
  auth_date!: number

  @ApiProperty({ description: 'Telegram HMAC-SHA256 signature' })
  @IsString()
  hash!: string
}
