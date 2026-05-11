import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { getRefreshSecret } from './auth-secrets'
import { getCrossSiteCookiePolicy } from './cookie-policy'

const COOKIE_NAME = 'discord_link_state'
const COOKIE_PATH = '/auth/discord'
const STATE_TTL_MS = 5 * 60 * 1000

interface StatePayload {
  user_id: number
  nonce: string
  exp: number
}

function signState(payload: StatePayload): string {
  const json = JSON.stringify(payload)
  const body = Buffer.from(json, 'utf8').toString('base64url')
  const sig = createHmac('sha256', getRefreshSecret())
    .update(body)
    .digest('base64url')
  return `${body}.${sig}`
}

function verifyState(token: string): StatePayload | null {
  const dot = token.indexOf('.')
  if (dot <= 0) return null

  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', getRefreshSecret())
    .update(body)
    .digest('base64url')

  if (sig.length !== expected.length) return null

  const sigBuf = Buffer.from(sig, 'utf8')
  const expectedBuf = Buffer.from(expected, 'utf8')
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as StatePayload
    if (
      typeof payload.user_id !== 'number' ||
      typeof payload.nonce !== 'string' ||
      typeof payload.exp !== 'number'
    ) {
      return null
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function setDiscordLinkStateCookie(
  res: Response,
  userId: number,
): string {
  const payload: StatePayload = {
    user_id: userId,
    nonce: randomBytes(16).toString('base64url'),
    exp: Math.floor((Date.now() + STATE_TTL_MS) / 1000),
  }

  res.cookie(COOKIE_NAME, signState(payload), {
    httpOnly: true,
    ...getCrossSiteCookiePolicy(),
    path: COOKIE_PATH,
    maxAge: STATE_TTL_MS,
  })

  return payload.nonce
}

export function readDiscordLinkStateCookie(
  req: Request,
  receivedState: string | undefined,
): number | null {
  if (!receivedState) return null

  const cookies = (req as Request & { cookies?: Record<string, string> })
    .cookies
  const value = cookies?.[COOKIE_NAME]
  if (typeof value !== 'string' || value.length === 0) return null

  const payload = verifyState(value)
  if (!payload || payload.nonce !== receivedState) return null

  return payload.user_id
}

export function clearDiscordLinkStateCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    ...getCrossSiteCookiePolicy(),
    path: COOKIE_PATH,
  })
}
