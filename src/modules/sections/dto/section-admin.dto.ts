import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateSectionDto {
  @ApiProperty({ description: 'Section display name' })
  @IsString()
  @MaxLength(255)
  name!: string

  @ApiProperty({ description: 'Optional icon URL/path', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  icon?: string
}

export class UpdateSectionDto {
  @ApiProperty({ description: 'Section display name', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string

  @ApiProperty({ description: 'Optional icon URL/path', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  icon?: string
}
