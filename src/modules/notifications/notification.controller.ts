import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common'
import { NotificationService } from './notification.service'
import { AuthGuard } from '@nestjs/passport'
import { Request } from 'express'
import { User } from '../users/user.entity'
import { RolesGuard } from '../../core/guards/roles.guard'
import { Roles } from '../../core/decorators/roles.decorator'

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  async findAll(@Req() req: Request) {
    const user = req.user as User
    const notifications = await this.notificationService.findAllForUser(user.id)
    return notifications
  }

  /**
   * Создание нового уведомления
   * Требует авторизации администратора
   */
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post()
  async create(
    @Body('title') title: string,
    @Body('message') message: string,
    @Body('is_important') isImportant: boolean,
    @Body('user_id') userId?: number,
  ) {
    const notificationData = {
      title,
      message,
      is_important: isImportant,
    }

    const newNotification = await this.notificationService.create(
      notificationData,
      userId,
    )

    return newNotification
  }
}
