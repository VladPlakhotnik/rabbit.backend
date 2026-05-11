import { createHmac, randomBytes } from 'crypto'
import { lookup } from 'dns/promises'
import { isIP } from 'net'

export type PartnerPostbackEventType =
  | 'test'
  | 'registration'
  | 'first_deposit'
  | 'commission_approved'
  | 'payout_paid'

export interface BuildPartnerPostbackPayloadInput {
  eventType: PartnerPostbackEventType
  partnerUserId: number
  data?: Record<string, unknown>
}

export interface PartnerPostbackPayload {
  event: PartnerPostbackEventType
  event_id: string
  occurred_at: string
  partner_user_id: number
  data: Record<string, unknown>
}

export const buildPartnerPostbackPayload = ({
  eventType,
  partnerUserId,
  data = {},
}: BuildPartnerPostbackPayloadInput): PartnerPostbackPayload => ({
  event: eventType,
  event_id: `evt_${randomBytes(12).toString('hex')}`,
  occurred_at: new Date().toISOString(),
  partner_user_id: partnerUserId,
  data,
})

export const signPartnerPostbackPayload = (
  payload: PartnerPostbackPayload,
  secret: string,
): string =>
  createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex')

export const isSafePartnerPostbackUrl = (rawUrl: string): boolean => {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:') {
      return false
    }

    const host = normalizeHostname(url.hostname)
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.localhost')
    ) {
      return false
    }

    return !isPrivateIp(host)
  } catch {
    return false
  }
}

export const isResolvedPartnerPostbackUrlSafe = async (
  rawUrl: string,
): Promise<boolean> => {
  if (!isSafePartnerPostbackUrl(rawUrl)) {
    return false
  }

  const hostname = normalizeHostname(new URL(rawUrl).hostname)
  if (isIP(hostname) !== 0) {
    return true
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true })

    return (
      addresses.length > 0 &&
      addresses.every(({ address }) => !isPrivateIp(address))
    )
  } catch {
    return false
  }
}

const isPrivateIp = (host: string): boolean => {
  const normalizedHost = normalizeHostname(host)
  const ipVersion = isIP(normalizedHost)
  if (ipVersion === 0) {
    return false
  }

  if (ipVersion === 6) {
    const ipv4Mapped = normalizedHost.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
    if (ipv4Mapped) {
      return isPrivateIp(ipv4Mapped[1])
    }

    return (
      normalizedHost === '::' ||
      normalizedHost === '::1' ||
      normalizedHost.startsWith('fc') ||
      normalizedHost.startsWith('fd') ||
      /^fe[89ab]/.test(normalizedHost)
    )
  }

  const [a, b] = normalizedHost.split('.').map(part => Number(part))
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return true
  }

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

const normalizeHostname = (host: string): string =>
  host.trim().toLowerCase().replace(/^\[(.*)]$/, '$1')
