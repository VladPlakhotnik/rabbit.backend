import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Notification } from './entities/notification.entity'
import { IsNull, Repository } from 'typeorm'
import { User } from '../users/user.entity'
import { NotificationView } from './entities/notificationView.entity'

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(NotificationView)
    private notificationViewRepository: Repository<NotificationView>,
  ) {}

  async findAll(): Promise<Notification[]> {
    return this.notificationRepository.find({ relations: ['user'] })
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
    userId?: number,
  ): Promise<Notification> {
    let user: User | null = null

    if (userId) {
      user = await this.userRepository.findOneBy({ id: userId })
      if (!user) {
        throw new NotFoundException('User not found')
      }
    }

    const newNotification = this.notificationRepository.create({
      ...notificationData,
      user_id: userId,
      created_at: new Date(),
    })

    return this.notificationRepository.save(newNotification)
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
    userId?: number,
  ): Promise<Notification> {
    const notification = await this.notificationRepository.findOneBy({ id })
    if (!notification) {
      throw new NotFoundException('Notification not found')
    }

    let user: User | null = null
    if (userId) {
      user = await this.userRepository.findOneBy({ id: userId })
      if (!user) {
        throw new NotFoundException('User not found')
      }
    }

    Object.assign(notification, updateData)
    if (userId !== undefined) {
      notification.user_id = userId
    }

    return this.notificationRepository.save(notification)
  }
}
