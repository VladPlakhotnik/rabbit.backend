import type { CookieOptions } from 'express'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function parseUrl(value: string | undefined): URL | null {
  if (!value || value.trim() === '') return null

  try {
    return new URL(value.trim())
  } catch {
    return null
  }
}

function isLocalHost(hostname: string): boolean {
  if (LOCAL_HOSTS.has(hostname)) return true
  return hostname.startsWith('127.')
}

/**
 * Fly does not always set NODE_ENV=production for manually deployed
 * images. Use the public HTTPS URLs too, because cross-site OAuth
 * cookies between Vercel and Fly require Secure + SameSite=None.
 */
export function isProductionCookieRuntime(): boolean {
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') return true

  const publicUrls = [
    parseUrl(process.env.BASE_URL),
    parseUrl(process.env.FRONTEND_URL),
  ].filter((url): url is URL => url !== null)

  return publicUrls.some(
    url => url.protocol === 'https:' && !isLocalHost(url.hostname),
  )
}

export function getCrossSiteCookiePolicy(): Pick<
  CookieOptions,
  'secure' | 'sameSite'
> {
  const productionRuntime = isProductionCookieRuntime()

  return {
    secure: productionRuntime,
    sameSite: productionRuntime ? 'none' : 'lax',
  }
}
