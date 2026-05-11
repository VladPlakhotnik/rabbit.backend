export interface PaginationInput {
  page?: number | string
  limit?: number | string
}

export interface NormalizedPagination {
  page: number
  limit: number
  skip: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

const toPositiveInteger = (
  value: number | string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export const normalizePagination = (
  input: PaginationInput = {},
): NormalizedPagination => {
  const page = toPositiveInteger(input.page, DEFAULT_PAGE)
  const limit = Math.min(
    toPositiveInteger(input.limit, DEFAULT_LIMIT),
    MAX_LIMIT,
  )

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  }
}

export const buildPaginatedResponse = <T>(
  items: T[],
  total: number,
  pagination: NormalizedPagination,
): PaginatedResponse<T> => ({
  items,
  total,
  page: pagination.page,
  limit: pagination.limit,
  totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
})
