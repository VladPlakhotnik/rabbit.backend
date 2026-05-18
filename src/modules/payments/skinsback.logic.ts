import { createHash, timingSafeEqual } from 'crypto'

import { UserDepositStatus } from '../users/user-deposit.entity'

export type SkinsbackKnownStatus =
  | 'pending'
  | 'success'
  | 'fail'
  | 'in_hold'
  | 'hold_approved'
  | 'hold_returned'

export const SKINSBACK_SOURCE = 'skinsback'

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

const readPositiveNumber = (value: unknown): number => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export const mapSkinsbackStatus = (
  status: string | null | undefined,
): UserDepositStatus => {
  switch (status) {
    case 'success':
      return UserDepositStatus.SUCCESS
    case 'fail':
    case 'hold_returned':
      return UserDepositStatus.CANCELLED
    case 'pending':
    case 'in_hold':
    case 'hold_approved':
      return UserDepositStatus.WAITING
    default:
      return UserDepositStatus.ERROR
  }
}

export const isSkinsbackFinalFailure = (
  status: string | null | undefined,
): boolean => status === 'fail' || status === 'hold_returned'

export const isSkinsbackFinalSuccess = (
  status: string | null | undefined,
): boolean => status === 'success'

export const getSkinsbackCreditAmount = (
  payload: Record<string, unknown>,
): number => {
  const userAmount = readPositiveNumber(payload.user_amount)
  if (userAmount > 0) {
    return roundMoney(userAmount)
  }

  return roundMoney(readPositiveNumber(payload.amount))
}

export const getSkinsbackFailureReason = (
  payload: Record<string, unknown>,
): string | null => {
  const reason = String(payload.reason ?? '').trim()
  if (reason) {
    return reason.slice(0, 255)
  }

  const status = String(payload.status ?? '').trim()
  if (isSkinsbackFinalFailure(status)) {
    return status.slice(0, 255)
  }

  return null
}

export const extractSkinsbackTradeToken = (
  tradeLink: string | null | undefined,
): string | null => {
  const value = tradeLink?.trim()
  if (!value) {
    return null
  }

  if (/^[A-Za-z0-9_-]{8}$/.test(value)) {
    return value
  }

  try {
    const url = new URL(value)
    const token = url.searchParams.get('token')?.trim()

    return token && /^[A-Za-z0-9_-]{8}$/.test(token) ? token : null
  } catch {
    return null
  }
}

export const verifySkinsbackSignature = ({
  clientId,
  clientSecret,
  providedSign,
}: {
  clientId: string
  clientSecret: string
  providedSign: string | null | undefined
}): boolean => {
  const provided = providedSign?.trim()
  if (!provided) {
    return false
  }

  const expected = createHash('md5')
    .update(`${clientId}${clientSecret}`)
    .digest('hex')

  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)

  if (expectedBuffer.length !== providedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, providedBuffer)
}

export const sanitizeSkinsbackPayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  const { sign: _sign, ...safePayload } = payload

  return safePayload
}
