import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

// Query DTO for `GET /clicker-users` admin listing. Pagination is
// mandatory in spirit (table will grow proportional to active players)
// but defaults to {page=1, limit=20} so a bare GET still works for
// quick checks.
//
// `@Type(() => Number)` is required: the global ValidationPipe runs
// with `enableImplicitConversion: false` (see main.ts), so query
// strings reach DTOs as `string` unless explicitly converted.
export class ListClickerUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number

  @IsOptional()
  @IsString()
  @MaxLength(64)
  search?: string
}
