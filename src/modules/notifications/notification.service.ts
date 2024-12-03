import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Notification } from './notification.entity'
import { IsNull, Repository } from 'typeorm'
import { User } from '../users/user.entity'

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Получение всех уведомлений
   */
  async findAll(): Promise<Notification[]> {
    return this.notificationRepository.find({ relations: ['user'] })
  }

  async findAllForUser(userId: number): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: [
        { user: { id: userId } }, // Персональные уведомления
        { user: IsNull() }, // Общие уведомления
      ],
      relations: ['user'],
    })
  }

  /**
   * Создание нового уведомления
   */
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
      user,
      created_at: new Date(),
    })

    return this.notificationRepository.save(newNotification)
  }
}
