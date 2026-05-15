type HeaderValue = string | string[] | undefined

export interface UserCountryCandidate {
  countryCode: string
  source: string
}

export interface UserCountryState {
  country_code?: string | null
  country_source?: string | null
}

type CountryHeader = {
  name: string
  source: string
}

const COUNTRY_HEADERS: CountryHeader[] = [
  { name: 'cf-ipcountry', source: 'cf-ipcountry' },
  { name: 'x-vercel-ip-country', source: 'x-vercel-ip-country' },
  { name: 'x-country-code', source: 'x-country-code' },
  { name: 'x-geo-country', source: 'x-geo-country' },
]

const NON_COUNTRY_CODES = new Set(['A1', 'A2', 'AP', 'EU', 'T1', 'XX'])

export function resolveCountryFromHeaders(
  headers: Record<string, HeaderValue>,
): UserCountryCandidate | null {
  for (const header of COUNTRY_HEADERS) {
    const countryCode = normalizeCountryCode(readHeader(headers, header.name))
    if (countryCode) {
      return {
        countryCode,
        source: header.source,
      }
    }
  }

  return null
}

export function shouldSetUserCountry(
  user: UserCountryState | null | undefined,
  country: UserCountryCandidate | null,
): boolean {
  if (!country) return false
  const current = user?.country_code?.trim()
  return !current
}

function readHeader(
  headers: Record<string, HeaderValue>,
  headerName: string,
): string | null {
  const direct = headers[headerName] ?? headers[headerName.toLowerCase()]
  if (Array.isArray(direct)) {
    return direct.find(value => value.trim().length > 0) ?? null
  }
  if (direct) return direct

  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === headerName.toLowerCase(),
  )
  const value = entry?.[1]
  if (Array.isArray(value)) {
    return value.find(item => item.trim().length > 0) ?? null
  }
  return value ?? null
}

function normalizeCountryCode(value: string | null): string | null {
  const code = value?.trim().toUpperCase()
  if (!code || !/^[A-Z]{2}$/.test(code)) return null
  if (NON_COUNTRY_CODES.has(code)) return null
  return code
}

