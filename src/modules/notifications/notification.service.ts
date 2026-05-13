import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Notification } from './entities/notification.entity'
import { IsNull, Repository, SelectQueryBuilder } from 'typeorm'
import { User } from '../users/user.entity'
import { NotificationView } from './entities/notificationView.entity'
import type {
  AdminNotificationListQueryDto,
  AdminNotificationTargetFilter,
} from './dto/admin-notification.dto'

// Gateway subscribes via `onNotification` to push freshly-created
// notifications to the right user's socket. Kept inside the service so
// callers (withdraw, upgrade, …) don't need to know about transport at
// all — they call `notify*` helpers and the WS push happens for free.
type NotificationSubscriber = (event: {
  userId: number | null
  notification: Notification
}) => void | Promise<void>

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)
  private readonly subscribers = new Set<NotificationSubscriber>()

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(NotificationView)
    private notificationViewRepository: Repository<NotificationView>,
  ) {}

  async findAll(): Promise<Notification[]> {
    return this.notificationRepository.find({ order: { created_at: 'DESC' } })
  }

  async findAllForAdmin(filters: AdminNotificationListQueryDto = {}): Promise<{
    filters: {
      i18nKey: string | null
      important: boolean | null
      search: string | null
      target: AdminNotificationTargetFilter
      userId: number | null
      viewed: boolean | null
    }
    hasMore: boolean
    items: Notification[]
    limit: number
    page: number
    total: number
  }> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)
    const target = filters.target ?? 'all'
    const search = filters.search?.trim() || null
    const i18nKey = filters.i18nKey?.trim() || null

    const qb = this.notificationRepository.createQueryBuilder('notification')
    const addWhere = this.createWhereAppender(qb)

    if (target === 'global') {
      addWhere('notification.user_id IS NULL')
    } else if (target === 'user') {
      addWhere('notification.user_id IS NOT NULL')
    }

    if (typeof filters.important === 'boolean') {
      addWhere('notification.is_important = :important', {
        important: filters.important,
      })
    }

    if (typeof filters.viewed === 'boolean') {
      addWhere('notification.is_viewed = :viewed', { viewed: filters.viewed })
    }

    if (i18nKey) {
      addWhere('notification.i18n_key = :i18nKey', { i18nKey })
    }

    if (filters.userId !== undefined) {
      addWhere('notification.user_id = :userId', { userId: filters.userId })
    }

    if (search) {
      addWhere(
        `(CAST(notification.id AS TEXT) ILIKE :search OR CAST(notification.user_id AS TEXT) ILIKE :search OR COALESCE(notification.title, '') ILIKE :search OR COALESCE(notification.message, '') ILIKE :search OR COALESCE(notification.i18n_key, '') ILIKE :search)`,
        { search: `%${search}%` },
      )
    }

    const [items, total] = await qb
      .orderBy('notification.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()

    return {
      filters: {
        i18nKey,
        important:
          typeof filters.important === 'boolean' ? filters.important : null,
        search,
        target,
        userId: filters.userId ?? null,
        viewed: typeof filters.viewed === 'boolean' ? filters.viewed : null,
      },
      hasMore: page * limit < total,
      items,
      limit,
      page,
      total,
    }
  }

  async findAdminById(id: number): Promise<Notification> {
    const notification = await this.notificationRepository.findOneBy({ id })
    if (!notification) {
      throw new NotFoundException('Notification not found')
    }
    return notification
  }

  async findAllForUser(userId: number): Promise<Notification[]> {
    const notifications = await this.notificationRepository.find({
      where: [{ user_id: userId }, { user_id: IsNull() }],
      order: { created_at: 'DESC' },
    })

    // Получаем просмотры для глобальных уведомлений
    const views = await this.notificationViewRepository.find({
      where: { user_id: userId },
    })

    const viewedIds = new Set(views.map(v => v.notification_id))

    // Добавляем информацию о просмотре
    return notifications.map(notification => ({
      ...notification,
      is_viewed:
        notification.user_id === userId
          ? notification.is_viewed
          : viewedIds.has(notification.id),
    }))
  }

  async markAsViewed(id: number, userId: number): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    })

    if (!notification) {
      throw new NotFoundException('Notification not found')
    }

    if (notification.user_id !== null && notification.user_id !== userId) {
      throw new NotFoundException('Notification not found')
    }

    if (notification.is_viewed === true) {
      throw new BadRequestException('Notification already viewed')
    }

    if (notification.user_id === userId) {
      // Для персональных уведомлений
      notification.is_viewed = true
      notification.viewed_at = new Date()
      await this.notificationRepository.save(notification)
    } else if (notification.user_id === null) {
      const existingView = await this.notificationViewRepository.findOne({
        where: {
          notification_id: id,
          user_id: userId,
        },
      })

      if (existingView) {
        throw new BadRequestException('Notification already viewed')
      }
      // Для глобальных уведомлений
      const view = this.notificationViewRepository.create({
        notification_id: id,
        user_id: userId,
        viewed_at: new Date(),
      })
      await this.notificationViewRepository.save(view)
    }
  }

  async create(
    notificationData: Partial<Notification>,
    userId?: number | null,
  ): Promise<Notification> {
    let user: User | null = null

    if (userId !== undefined && userId !== null) {
      user = await this.userRepository.findOneBy({ id: userId })
      if (!user) {
        throw new NotFoundException('User not found')
      }
    }

    const newNotification = this.notificationRepository.create({
      ...notificationData,
      user_id: userId ?? null,
      created_at: new Date(),
    })
    this.ensureContent(newNotification)

    const saved = await this.notificationRepository.save(newNotification)
    await this.fanout(saved)
    return saved
  }

  // ---- Pub/Sub bridge to the gateway -------------------------------

  // Returns an unsubscribe handle so callers can clean up on shutdown
  // (gateway lifecycle).
  onNotification(cb: NotificationSubscriber): () => void {
    this.subscribers.add(cb)
    return () => {
      this.subscribers.delete(cb)
    }
  }

  private async fanout(notification: Notification): Promise<void> {
    if (this.subscribers.size === 0) return
    await Promise.all(
      Array.from(this.subscribers).map(async sub => {
        try {
          await sub({ userId: notification.user_id ?? null, notification })
        } catch (err) {
          // Subscriber failures must not break the create() caller —
          // the notification is already persisted. Just log.
          this.logger.warn(
            `Notification subscriber failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        }
      }),
    )
  }

  // ---- Typed helpers used by other modules -------------------------
  //
  // Each helper writes a typed event row: `i18n_key` plus a JSON
  // `i18n_params` payload. Frontend renders text via
  // `t('notifications.events.<key>.{title,message}', params)`, so the
  // user sees their current locale even for old notifications. None of
  // these helpers fill `title` / `message` — those are reserved for
  // free-form admin broadcasts.

  // Withdrawal succeeded: TM trade went through, user now has the skin.
  // `actualPrice` is what TM actually paid (may be lower than target);
  // `null` means the parser didn't see a price — UI shows a no-amount
  // variant of the message in that case.
  async notifyWithdrawCompleted(
    userId: number,
    actualPrice: number | null,
  ): Promise<Notification> {
    return this.create(
      {
        i18n_key: 'withdraw.completed',
        i18n_params: actualPrice != null ? { price: actualPrice } : {},
        is_important: false,
      },
      userId,
    )
  }

  // Withdrawal failed: TM rejected / trade timed out. `reason` is a
  // stable key (`trade_timed_out_buyer`, `trade_timed_out_seller`,
  // `trade_failed`) — frontend translates it via
  // `notifications.events.withdraw.failureReason.<reason>`.
  async notifyWithdrawFailed(
    userId: number,
    reason: string,
  ): Promise<Notification> {
    return this.create(
      {
        i18n_key: 'withdraw.failed',
        i18n_params: { reason },
        is_important: true,
      },
      userId,
    )
  }

  // Stub for the future deposit flow. The payments module currently
  // only creates Stripe payment intents and has no completion path —
  // when that lands, call this from the success webhook / handler.
  async notifyDepositCompleted(
    userId: number,
    amount: number,
    method?: string,
  ): Promise<Notification> {
    return this.create(
      {
        i18n_key: 'deposit.completed',
        i18n_params: method ? { amount, method } : { amount },
        is_important: false,
      },
      userId,
    )
  }

  // Deposit failed — `reason` is one of the keys translated under
  // `notifications.events.deposit.failureReason.*`
  // (`card_declined`, `insufficient_funds`, `processor_error`,
  //  `expired`, `generic`).
  async notifyDepositFailed(
    userId: number,
    reason: string,
    amount?: number,
  ): Promise<Notification> {
    return this.create(
      {
        i18n_key: 'deposit.failed',
        i18n_params: amount != null ? { reason, amount } : { reason },
        is_important: true,
      },
      userId,
    )
  }

  async notifyGiveawayWon(
    userId: number,
    giveawayName: string,
    skinName: string,
  ): Promise<Notification> {
    return this.create(
      {
        i18n_key: 'giveaway.won',
        i18n_params: { giveawayName, skinName },
        is_important: true,
      },
      userId,
    )
  }

  async notifyVipLevelUp(
    userId: number,
    tierId: string,
    threshold: number,
  ): Promise<Notification> {
    return this.create(
      {
        i18n_key: 'vip.levelUp',
        i18n_params: { tierId, threshold },
        is_important: true,
      },
      userId,
    )
  }

  async delete(id: number): Promise<void> {
    const notification = await this.notificationRepository.findOneBy({ id })
    if (!notification) {
      throw new NotFoundException('Notification not found')
    }
    await this.notificationRepository.remove(notification)
  }

  async update(
    id: number,
    updateData: Partial<Notification>,
    userId?: number | null,
  ): Promise<Notification> {
    const notification = await this.notificationRepository.findOneBy({ id })
    if (!notification) {
      throw new NotFoundException('Notification not found')
    }

    let user: User | null = null
    if (userId !== undefined && userId !== null) {
      user = await this.userRepository.findOneBy({ id: userId })
      if (!user) {
        throw new NotFoundException('User not found')
      }
    }

    Object.assign(notification, updateData)
    if (userId !== undefined) {
      notification.user_id = userId
    }
    this.ensureContent(notification)

    return this.notificationRepository.save(notification)
  }

  private createWhereAppender(qb: SelectQueryBuilder<Notification>) {
    let hasWhere = false
    return (condition: string, parameters?: Record<string, unknown>) => {
      if (hasWhere) {
        qb.andWhere(condition, parameters)
      } else {
        qb.where(condition, parameters)
        hasWhere = true
      }
    }
  }

  private ensureContent(
    notification: Pick<Notification, 'i18n_key' | 'message' | 'title'>,
  ): void {
    if (
      !notification.i18n_key &&
      (!notification.title || !notification.message)
    ) {
      throw new BadRequestException(
        'Provide either i18n_key or both title and message.',
      )
    }
  }
}
