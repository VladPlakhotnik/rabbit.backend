import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'

import { NotificationService } from '../notifications/notification.service'
import {
  PartnerService,
  type PartnerReferralDepositPostback,
} from '../partners/partner.service'
import { UserDeposit, UserDepositStatus } from '../users/user-deposit.entity'
import { User } from '../users/user.entity'
import { getVipTierForXp } from '../vip/vip-rewards.logic'
import type { CreateSkinsbackDepositDto } from './dto/create-skinsback-deposit.dto'
import { SkinsbackClient } from './skinsback.client'
import {
  SKINSBACK_SOURCE,
  extractSkinsbackTradeToken,
  getSkinsbackCreditAmount,
  getSkinsbackFailureReason,
  isSkinsbackFinalFailure,
  isSkinsbackFinalSuccess,
  mapSkinsbackStatus,
  sanitizeSkinsbackPayload,
  verifySkinsbackSignature,
} from './skinsback.logic'

export interface SkinsbackCreateDepositResult {
  deposit_id: number
  order_id: string
  transaction_id: string
  url: string
}

export interface SkinsbackWebhookResult {
  credited: boolean
  deposit_id: number
  status: UserDepositStatus
}

type WebhookHeaders = Record<string, string | string[] | undefined>
type WebhookPayload = Record<string, unknown>

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '')

const readHeader = (
  headers: WebhookHeaders,
  name: string,
): string | undefined => {
  const value = headers[name] ?? headers[name.toLowerCase()]
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

const normalizePayload = (payload: WebhookPayload): WebhookPayload =>
  Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  )

@Injectable()
export class SkinsbackService {
  private readonly logger = new Logger(SkinsbackService.name)

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserDeposit)
    private readonly depositRepository: Repository<UserDeposit>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly skinsbackClient: SkinsbackClient,
    private readonly notificationService: NotificationService,
    private readonly partnerService: PartnerService,
  ) {}

  async createDeposit(
    userId: number,
    dto: CreateSkinsbackDepositDto,
  ): Promise<SkinsbackCreateDepositResult> {
    const user = await this.userRepository.findOne({ where: { id: userId } })
    if (!user) {
      throw new NotFoundException('User not found')
    }
    if (!user.steam_id) {
      throw new BadRequestException('Steam account is required')
    }
    if (
      dto.minAmount !== undefined &&
      dto.maxAmount !== undefined &&
      dto.minAmount > dto.maxAmount
    ) {
      throw new BadRequestException('minAmount must be less than maxAmount')
    }

    const deposit = await this.depositRepository.save(
      this.depositRepository.create({
        amount: 0,
        bonus_amount: 0,
        provider_payload: {
          requested_max_amount: dto.maxAmount ?? null,
          requested_min_amount: dto.minAmount ?? null,
        },
        provider_status: 'created',
        source: SKINSBACK_SOURCE,
        status: UserDepositStatus.WAITING,
        user_id: userId,
      }),
    )
    const orderId = `bunny-${deposit.id}`
    deposit.external_order_id = orderId
    await this.depositRepository.save(deposit)

    try {
      const response = await this.skinsbackClient.createOrder({
        currency: this.getCurrency(),
        fail_url: this.getFailUrl(),
        max_amount: dto.maxAmount,
        min_amount: dto.minAmount,
        order_id: orderId,
        result_url: this.getResultUrl(),
        steam_id: String(user.steam_id),
        success_url: this.getSuccessUrl(),
        trade_token: extractSkinsbackTradeToken(user.trade_link) ?? undefined,
      })

      deposit.external_id = String(response.transaction_id)
      deposit.provider_status = 'pending'
      deposit.provider_payload = {
        ...(deposit.provider_payload ?? {}),
        create_response: {
          transaction_id: response.transaction_id,
          url: response.url,
        },
      }
      await this.depositRepository.save(deposit)

      return {
        deposit_id: deposit.id,
        order_id: orderId,
        transaction_id: String(response.transaction_id),
        url: response.url,
      }
    } catch (error) {
      deposit.status = UserDepositStatus.ERROR
      deposit.provider_status = 'create_failed'
      deposit.failure_reason =
        error instanceof Error ? error.message.slice(0, 255) : 'create_failed'
      await this.depositRepository.save(deposit)
      throw error
    }
  }

  async handleWebhook(
    headers: WebhookHeaders,
    payload: WebhookPayload,
  ): Promise<SkinsbackWebhookResult> {
    const clientId = this.configService.get<string>('SKINSBACK_CLIENT_ID')?.trim()
    const clientSecret = this.configService
      .get<string>('SKINSBACK_CLIENT_SECRET')
      ?.trim()
    if (!clientId || !clientSecret) {
      throw new UnauthorizedException('Skinsback is not configured')
    }

    const normalizedPayload = normalizePayload(payload)
    const providedSign =
      readHeader(headers, 'x-sign') ??
      readHeader(headers, 'X-SIGN') ??
      String(normalizedPayload.sign ?? '')

    if (
      !verifySkinsbackSignature({
        clientId,
        clientSecret,
        providedSign,
      })
    ) {
      throw new UnauthorizedException('Invalid Skinsback signature')
    }

    const orderId = String(normalizedPayload.order_id ?? '').trim()
    const transactionId = String(normalizedPayload.transaction_id ?? '').trim()
    if (!orderId && !transactionId) {
      throw new BadRequestException('Missing Skinsback order identifier')
    }

    const handled = await this.dataSource.transaction(async manager => {
      let notifySuccess: { amount: number; userId: number } | null = null
      let notifyFailure: { reason: string; userId: number } | null = null
      let partnerPostback: PartnerReferralDepositPostback | null = null
      const depositRepository = manager.getRepository(UserDeposit)
      const query = depositRepository
        .createQueryBuilder('deposit')
        .setLock('pessimistic_write')

      if (orderId) {
        query.where('deposit.external_order_id = :orderId', { orderId })
      } else {
        query.where('deposit.external_id = :transactionId', {
          transactionId,
        })
      }

      const deposit = await query.getOne()
      if (!deposit) {
        throw new NotFoundException('Deposit not found')
      }
      if (
        transactionId &&
        deposit.external_id &&
        deposit.external_id !== transactionId
      ) {
        throw new BadRequestException('Mismatched Skinsback transaction')
      }

      const previousStatus = deposit.status
      const wasCredited = Boolean(deposit.credited_at)
      const rawStatus = String(normalizedPayload.status ?? '').trim()
      const mappedStatus = mapSkinsbackStatus(rawStatus)
      const creditAmount = getSkinsbackCreditAmount(normalizedPayload)
      const failureReason = getSkinsbackFailureReason(normalizedPayload)

      deposit.external_id = transactionId || deposit.external_id
      deposit.external_order_id = orderId || deposit.external_order_id
      deposit.provider_status = rawStatus || deposit.provider_status
      deposit.provider_payload = {
        ...(deposit.provider_payload ?? {}),
        last_webhook: sanitizeSkinsbackPayload(normalizedPayload),
      }
      deposit.steam_id = String(normalizedPayload.steam_id ?? '').trim() || null
      deposit.trade_offer_id =
        String(normalizedPayload.trade_offer_id ?? '').trim() || null
      deposit.failure_reason = failureReason

      if (creditAmount > 0) {
        deposit.amount = creditAmount
      }

      if (isSkinsbackFinalSuccess(rawStatus)) {
        if (creditAmount <= 0) {
          deposit.status = UserDepositStatus.ERROR
          deposit.failure_reason = 'invalid_amount'
        } else if (!wasCredited) {
          const user = await manager.findOne(User, {
            lock: { mode: 'pessimistic_write' },
            where: { id: deposit.user_id },
          })
          if (!user) {
            throw new NotFoundException('User not found')
          }

          const previousDepositAmount = Number(user.deposit_amount ?? 0)
          const bonusAmount = this.calculateVipDepositBonus(user, creditAmount)
          deposit.bonus_amount = bonusAmount
          deposit.status = UserDepositStatus.SUCCESS
          deposit.credited_at = new Date()
          user.balance = roundMoney(
            (user.balance ?? 0) + creditAmount + bonusAmount,
          )
          user.deposit_amount = roundMoney(
            Number(user.deposit_amount ?? 0) + creditAmount,
          )
          await manager.save(User, user)
          partnerPostback = await this.partnerService.recordReferralDeposit(
            manager,
            {
              amount: creditAmount,
              depositId: deposit.id,
              firstDeposit: previousDepositAmount <= 0,
              referralUser: user,
              source: SKINSBACK_SOURCE,
            },
          )

          notifySuccess = {
            amount: creditAmount + bonusAmount,
            userId: deposit.user_id,
          }
        } else {
          deposit.status = UserDepositStatus.SUCCESS
        }
      } else {
        deposit.status = mappedStatus
      }

      if (
        (isSkinsbackFinalFailure(rawStatus) ||
          mappedStatus === UserDepositStatus.ERROR) &&
        previousStatus !== deposit.status
      ) {
        notifyFailure = {
          reason: deposit.failure_reason ?? 'generic',
          userId: deposit.user_id,
        }
      }

      await depositRepository.save(deposit)

      return {
        notification: {
          failure: notifyFailure,
          success: notifySuccess,
        },
        partnerPostback,
        result: {
          credited: Boolean(isSkinsbackFinalSuccess(rawStatus) && !wasCredited),
          deposit_id: deposit.id,
          status: deposit.status,
        },
      }
    })

    if (handled.partnerPostback) {
      await this.partnerService
        .dispatchReferralFirstDepositPostback(handled.partnerPostback)
        .catch(error =>
          this.logger.warn(
            `Failed to dispatch partner first-deposit postback: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        )
    }

    if (handled.notification.success) {
      await this.notificationService
        .notifyDepositCompleted(
          handled.notification.success.userId,
          handled.notification.success.amount,
          SKINSBACK_SOURCE,
        )
        .catch(error =>
          this.logger.warn(
            `Failed to notify deposit success: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        )
    }

    if (handled.notification.failure) {
      await this.notificationService
        .notifyDepositFailed(
          handled.notification.failure.userId,
          handled.notification.failure.reason,
        )
        .catch(error =>
          this.logger.warn(
            `Failed to notify deposit failure: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        )
    }

    return handled.result
  }

  private calculateVipDepositBonus(user: User, amount: number): number {
    const tier = getVipTierForXp(user.vip_xp ?? user.vip_qualifying_volume ?? 0)
    if (
      tier.depositBonusRate <= 0 ||
      amount < tier.depositMinAmount ||
      amount <= 0
    ) {
      return 0
    }

    return roundMoney(
      Math.min((amount * tier.depositBonusRate) / 100, tier.depositBonusCap),
    )
  }

  private getCurrency(): string {
    return (
      this.configService.get<string>('SKINSBACK_CURRENCY')?.trim() || 'usd'
    )
  }

  private getResultUrl(): string | undefined {
    const explicit = this.configService.get<string>('SKINSBACK_RESULT_URL')?.trim()
    if (explicit) {
      return explicit
    }

    const baseUrl = this.getBackendBaseUrl()
    return baseUrl ? `${baseUrl}/payment/skinsback/webhook` : undefined
  }

  private getSuccessUrl(): string | undefined {
    const explicit = this.configService
      .get<string>('SKINSBACK_SUCCESS_URL')
      ?.trim()
    if (explicit) {
      return explicit
    }

    const frontendUrl = this.getFrontendUrl()
    return frontendUrl
      ? `${frontendUrl}/payment/history?tab=deposit&provider=skinsback&status=success`
      : undefined
  }

  private getFailUrl(): string | undefined {
    const explicit = this.configService.get<string>('SKINSBACK_FAIL_URL')?.trim()
    if (explicit) {
      return explicit
    }

    const frontendUrl = this.getFrontendUrl()
    return frontendUrl
      ? `${frontendUrl}/payment/history?tab=deposit&provider=skinsback&status=fail`
      : undefined
  }

  private getBackendBaseUrl(): string | null {
    const raw =
      this.configService.get<string>('SKINSBACK_PUBLIC_BACKEND_URL')?.trim() ||
      this.configService.get<string>('BASE_URL')?.trim()

    return raw ? stripTrailingSlash(raw) : null
  }

  private getFrontendUrl(): string | null {
    const raw =
      this.configService.get<string>('SKINSBACK_FRONTEND_URL')?.trim() ||
      this.configService.get<string>('FRONTEND_URL')?.trim()

    return raw ? stripTrailingSlash(raw) : null
  }
}
