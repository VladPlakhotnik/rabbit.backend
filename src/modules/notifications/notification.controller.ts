import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Delete,
  Param,
  Patch,
} from '@nestjs/common'
import { NotificationService } from './notification.service'
import { AuthGuard } from '@nestjs/passport'
import { Request } from 'express'
import { User } from '../users/user.entity'
import { RolesGuard } from '../../core/guards/roles.guard'
import { Roles } from '../../core/decorators/roles.decorator'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'

/**
 * Controller for working with notifications
 * @class NotificationController
 */

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @ApiOperation({ summary: 'Get all notifications for a user' })
  @ApiResponse({
    status: 200,
    description: 'Return all notifications for a user',
  })
  @UseGuards(AuthGuard('jwt'))
  @Get()
  async findAll(@Req() req: Request) {
    const user = req.user as User
    const notifications = await this.notificationService.findAllForUser(user.id)
    return notifications
  }

  @ApiOperation({ summary: 'Mark notification as viewed' })
  @ApiResponse({ status: 200, description: 'Notification marked as viewed' })
  @UseGuards(AuthGuard('jwt'))
  @Patch(':id/view')
  async markAsViewed(@Param('id') id: number, @Req() req: Request) {
    const user = req.user as User
    return this.notificationService.markAsViewed(id, user.id)
  }

  @ApiOperation({ summary: 'Create a new notification' })
  @ApiResponse({ status: 200, description: 'Return created notification' })
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

  @ApiOperation({ summary: 'Delete a notification' })
  @ApiResponse({
    status: 200,
    description: 'Notification successfully deleted',
  })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Delete(':id')
  async delete(@Param('id') id: number) {
    await this.notificationService.delete(id)
    return { message: 'Notification successfully deleted' }
  }

  @ApiOperation({ summary: 'Update a notification' })
  @ApiResponse({ status: 200, description: 'Return updated notification' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Patch(':id')
  async update(
    @Param('id') id: number,
    @Body('title') title?: string,
    @Body('message') message?: string,
    @Body('is_important') isImportant?: boolean,
    @Body('user_id') userId?: number,
  ) {
    const updateData = {
      title,
      message,
      is_important: isImportant,
    }

    const updatedNotification = await this.notificationService.update(
      id,
      updateData,
      userId,
    )

    return updatedNotification
  }
}
