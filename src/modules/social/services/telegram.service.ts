import {
  Inject,
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import * as crypto from 'crypto'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../../../core/redis/redis.constants'

/**
 * Result of a successful initData verification. Mirrors the subset of the
 * `WebAppUser` payload the rest of the system actually uses — `is_premium`,
 * `language_code`, `allows_write_to_pm`, etc. are intentionally dropped on
 * the floor here so callers can't accidentally lean on Telegram-side data
 * that isn't auth-relevant.
 */
export interface VerifiedInitData {
  telegramId: number
  firstName?: string
  lastName?: string
  username?: string
  photoUrl?: string
  /** Set when the Mini App was launched via deep-link `?startapp=PARAM`. */
  startParam?: string
}

interface TelegramChatMember {
  status:
    | 'creator'
    | 'administrator'
    | 'member'
    | 'restricted'
    | 'left'
    | 'kicked'
  is_member?: boolean
  user: {
    id: number
    is_bot: boolean
    first_name: string
    username?: string
  }
}

interface TelegramApiResponse<T> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
}

const isTelegramNotSubscribedDescription = (
  description?: string,
): boolean => {
  if (!description) {
    return false
  }

  return /user not found|member not found|participant|not a member/i.test(
    description,
  )
}

const getTelegramApiError = (
  error: unknown,
): { status?: number; description?: string } => {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return {}
  }

  const response = error.response
  if (!response || typeof response !== 'object') {
    return {}
  }

  const status =
    'status' in response && typeof response.status === 'number'
      ? response.status
      : undefined
  const data = 'data' in response ? response.data : undefined
  const rawDescription =
    data && typeof data === 'object' && 'description' in data
      ? data.description
      : undefined
  const description =
    typeof rawDescription === 'string' ? rawDescription : undefined

  return { status, description }
}

// Tightened from the original 24h. The auth payload only needs to live
// long enough for the user to receive it from the Login Widget / bot and
// hand it off to our backend; anything longer just gives an attacker who
// captures the hash a longer replay window. Industry guidance for
// payment / gambling-adjacent sites is 5–10 min — 5 fits comfortably.
const TELEGRAM_AUTH_MAX_AGE_SEC = 5 * 60
const TELEGRAM_AUTH_FUTURE_SKEW_SEC = 60

const isValidTelegramHash = (hash: unknown): hash is string =>
  typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash)

const safeCompareHex = (left: unknown, right: unknown): boolean => {
  if (!isValidTelegramHash(left) || !isValidTelegramHash(right)) {
    return false
  }

  const leftBuffer = Buffer.from(left, 'hex')
  const rightBuffer = Buffer.from(right, 'hex')

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  )
}

const assertFreshTelegramAuthDate = (
  authDate: number,
  expiredMessage: string,
): void => {
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new BadRequestException('Telegram authentication date is malformed')
  }

  const currentTime = Math.floor(Date.now() / 1000)
  if (authDate - currentTime > TELEGRAM_AUTH_FUTURE_SKEW_SEC) {
    throw new BadRequestException('Telegram authentication data is not valid yet')
  }

  if (currentTime - authDate > TELEGRAM_AUTH_MAX_AGE_SEC) {
    throw new BadRequestException(expiredMessage)
  }
}

/**
 * Service for working with Telegram Bot API
 * @class TelegramService
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name)
  private readonly botToken: string
  private readonly channelChatId: string
  private readonly baseUrl: string

  constructor(
    private readonly httpService: HttpService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || ''
    this.channelChatId = process.env.TELEGRAM_CHANNEL_CHAT_ID || ''

    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN is not set in environment variables')
    }

    if (!this.channelChatId) {
      this.logger.warn(
        'TELEGRAM_CHANNEL_CHAT_ID is not set in environment variables',
      )
    }

    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`
  }

  /**
   * Check if user is subscribed to the Telegram channel
   * @param telegramUserId - Telegram user ID
   * @returns true if user is subscribed, false otherwise
   */
  async checkSubscription(telegramUserId: number): Promise<boolean> {
    if (!this.botToken || !this.channelChatId) {
      throw new BadRequestException(
        'Telegram bot configuration is not set. Please contact administrator.',
      )
    }

    try {
      const url = `${this.baseUrl}/getChatMember`
      const response = await firstValueFrom(
        this.httpService.get<TelegramApiResponse<TelegramChatMember>>(url, {
          params: {
            chat_id: this.channelChatId,
            user_id: telegramUserId,
          },
          timeout: 8000,
        }),
      )

      if (!response.data.ok) {
        if (isTelegramNotSubscribedDescription(response.data.description)) {
          return false
        }

        this.logger.error(
          `Telegram API error: ${response.data.description || 'Unknown error'}`,
        )
        throw new BadRequestException(
          `Failed to check subscription: ${
            response.data.description || 'Unknown error'
          }`,
        )
      }

      const member = response.data.result
      if (!member) {
        return false
      }

      // Restricted Telegram members are still inside a supergroup when
      // `is_member` is true; count them as subscribed for this reward.
      const subscribedStatuses: TelegramChatMember['status'][] = [
        'creator',
        'administrator',
        'member',
      ]

      return (
        subscribedStatuses.includes(member.status) ||
        (member.status === 'restricted' && member.is_member === true)
      )
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error
      }

      this.logger.error(
        `Error checking Telegram subscription: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )

      // Telegram returns 400-style errors for "not a participant" cases.
      // Treat only those as not subscribed; surface chat/bot config errors.
      const telegramApiError = getTelegramApiError(error)
      if (
        telegramApiError.status === 400 &&
        isTelegramNotSubscribedDescription(telegramApiError.description)
      ) {
        return false
      }

      throw new BadRequestException(
        `Failed to verify subscription. Please make sure you are subscribed to the channel and try again.`,
      )
    }
  }

  /**
   * Verify Telegram authentication data from Login Widget.
   *
   * Layered defence:
   *   1. `auth_date` window — payload must be no older than
   *      TELEGRAM_AUTH_MAX_AGE_SEC. Caps how long a leaked hash is useful.
   *   2. HMAC-SHA256 over a sorted `key=value\n` string, secret =
   *      SHA256(bot_token). Standard Telegram widget contract.
   *   3. One-time use — the verified `(telegram_id, hash)` is recorded in
   *      Redis with TTL = auth-window. Re-presenting the same hash inside
   *      the window is rejected, so a captured payload can't be replayed
   *      twice (e.g. once by the legitimate user, then again by an
   *      attacker who sniffed it from the network).
   *
   * Returns the Telegram user id on success, throws BadRequestException
   * otherwise.
   */
  async verifyAuthData(authData: {
    id: number
    first_name?: string
    last_name?: string
    username?: string
    photo_url?: string
    auth_date: number
    hash: string
  }): Promise<number> {
    if (!this.botToken) {
      throw new BadRequestException('Telegram bot token is not configured')
    }

    assertFreshTelegramAuthDate(
      authData.auth_date,
      'Telegram authentication data has expired',
    )

    // HMAC verification.
    const { hash, ...dataWithoutHash } = authData
    const dataCheckString = Object.entries(dataWithoutHash)
      .filter(([, value]) => value !== undefined && value !== null)
      .sort()
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')

    const secretKey = crypto.createHash('sha256').update(this.botToken).digest()
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    if (!safeCompareHex(calculatedHash, hash)) {
      throw new BadRequestException(
        'Invalid Telegram authentication data. Hash verification failed.',
      )
    }

    // Replay protection — claim the (telegram_id, hash) pair in Redis with
    // TTL == auth-age window. NX semantics: SET fails if the key already
    // exists, which means this exact hash was already accepted.
    //
    // Redis is best-effort here: if it's down the SET returns null and we
    // accept the auth (hash + auth_date alone are still verified), rather
    // than locking users out. Hosting a single Redis instance, this is the
    // right trade-off; if you ever shard or run replicated, revisit.
    try {
      const replayKey = `tg:authhash:${authData.id}:${hash}`
      const ok = await this.redis.set(
        replayKey,
        '1',
        'EX',
        TELEGRAM_AUTH_MAX_AGE_SEC,
        'NX',
      )
      if (ok === null) {
        throw new BadRequestException(
          'Telegram authentication payload already used',
        )
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err
      this.logger.warn(
        `Telegram replay-check unavailable: ${
          err instanceof Error ? err.message : err
        }`,
      )
    }

    return authData.id
  }

  /**
   * Verify a Telegram Mini App `initData` payload.
   *
   * Same threat model as `verifyAuthData` (window + HMAC + replay-gate) but
   * the secret-key derivation is *different*: Telegram explicitly uses
   *   secret = HMAC_SHA256(key="WebAppData", message=bot_token)
   * for Mini Apps, vs.
   *   secret = SHA256(bot_token)
   * for the Login Widget. Mixing the two is silent breakage — the HMAC
   * just won't match — so we keep them as separate methods.
   *
   * Input is the raw query-string Telegram puts in
   * `window.Telegram.WebApp.initData` (e.g. "auth_date=…&hash=…&user=%7B…").
   *
   * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
   */
  async verifyInitData(initData: string): Promise<VerifiedInitData> {
    if (!this.botToken) {
      throw new BadRequestException('Telegram bot token is not configured')
    }
    if (!initData || typeof initData !== 'string') {
      throw new BadRequestException('initData is required')
    }

    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) {
      throw new BadRequestException('initData missing hash')
    }
    const authDateRaw = params.get('auth_date')
    if (!authDateRaw) {
      throw new BadRequestException('initData missing auth_date')
    }
    const authDate = Number(authDateRaw)
    if (!Number.isFinite(authDate) || authDate <= 0) {
      throw new BadRequestException('initData auth_date is malformed')
    }

    // 1. auth-window — same 5 min as the Login Widget.
    const currentTime = Math.floor(Date.now() / 1000)
    if (authDate - currentTime > TELEGRAM_AUTH_FUTURE_SKEW_SEC) {
      throw new UnauthorizedException('initData is not valid yet')
    }
    if (currentTime - authDate > TELEGRAM_AUTH_MAX_AGE_SEC) {
      throw new UnauthorizedException('initData has expired')
    }

    // 2. data_check_string: every k=v except `hash`, sorted by key, joined
    //    by '\n'. URLSearchParams already gives us decoded values, which is
    //    what Telegram signs against.
    const pairs: string[] = []
    for (const [key, value] of params.entries()) {
      if (key === 'hash') continue
      pairs.push(`${key}=${value}`)
    }
    pairs.sort()
    const dataCheckString = pairs.join('\n')

    // 3. Mini-App-specific secret derivation (NOT sha256(bot_token)).
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(this.botToken)
      .digest()
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    // Constant-time compare to make hash-equality not depend on input.
    if (!safeCompareHex(calculatedHash, hash)) {
      throw new UnauthorizedException('initData hash verification failed')
    }

    // 4. Replay-gate — Mini App reuses the same hash when the user reopens
    //    the app inside the same session, so the gate has to be keyed by
    //    (telegram_id, hash). Best-effort, like verifyAuthData.
    const userJsonForReplay = params.get('user') ?? ''
    let replayUserId = 0
    try {
      const tmp = JSON.parse(userJsonForReplay) as { id?: unknown }
      if (typeof tmp.id === 'number') replayUserId = tmp.id
    } catch {
      // fall through — replayUserId stays 0, the hash itself still
      // disambiguates payloads
    }
    try {
      const replayKey = `tg:miniapp:${replayUserId}:${hash}`
      const ok = await this.redis.set(
        replayKey,
        '1',
        'EX',
        TELEGRAM_AUTH_MAX_AGE_SEC,
        'NX',
      )
      if (ok === null) {
        throw new UnauthorizedException('initData payload already used')
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err
      this.logger.warn(
        `Telegram Mini App replay-check unavailable: ${
          err instanceof Error ? err.message : err
        }`,
      )
    }

    // 5. Extract the user payload — required, since we use telegram_id as
    //    the account-anchor.
    const userJson = params.get('user')
    if (!userJson) {
      throw new BadRequestException('initData missing user')
    }
    let parsedUser: {
      id?: unknown
      first_name?: unknown
      last_name?: unknown
      username?: unknown
      photo_url?: unknown
    }
    try {
      parsedUser = JSON.parse(userJson) as typeof parsedUser
    } catch {
      throw new BadRequestException('initData user is not valid JSON')
    }
    if (typeof parsedUser.id !== 'number' || !Number.isFinite(parsedUser.id)) {
      throw new BadRequestException('initData user.id missing or not numeric')
    }

    return {
      telegramId: parsedUser.id,
      firstName:
        typeof parsedUser.first_name === 'string'
          ? parsedUser.first_name
          : undefined,
      lastName:
        typeof parsedUser.last_name === 'string'
          ? parsedUser.last_name
          : undefined,
      username:
        typeof parsedUser.username === 'string' ? parsedUser.username : undefined,
      photoUrl:
        typeof parsedUser.photo_url === 'string'
          ? parsedUser.photo_url
          : undefined,
      startParam: params.get('start_param') ?? undefined,
    }
  }
}
