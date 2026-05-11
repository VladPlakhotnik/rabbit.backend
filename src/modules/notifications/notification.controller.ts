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
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common'
import { NotificationService } from './notification.service'
import { AuthGuard } from '@nestjs/passport'
import { Request } from 'express'
import { User } from '../users/user.entity'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminRole } from '../admin/types/admin-role.enum'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import type { NotificationParams } from './entities/notification.entity'

// Admin-create payload. Two valid shapes:
//   typed event:  { i18n_key, i18n_params?, is_important, user_id? }
//   free-form:    { title, message, is_important, user_id? }
// At least one of the two paths must be present — the SQL CHECK
// constraint enforces it server-side, this handler also validates
// up-front so the admin gets a clean 400 instead of a Postgres error.
interface CreateNotificationBody {
  title?: string
  message?: string
  i18n_key?: string
  i18n_params?: NotificationParams
  is_important?: boolean
  user_id?: number
}

interface UpdateNotificationBody extends CreateNotificationBody {}

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
  async markAsViewed(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req.user as User
    return this.notificationService.markAsViewed(id, user.id)
  }

  @ApiOperation({ summary: 'Create a new notification' })
  @ApiResponse({ status: 200, description: 'Return created notification' })
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @Post()
  async create(@Body() body: CreateNotificationBody) {
    const notificationData = this.assemblePayload(body)
    return this.notificationService.create(notificationData, body.user_id)
  }

  @ApiOperation({ summary: 'Delete a notification' })
  @ApiResponse({
    status: 200,
    description: 'Notification successfully deleted',
  })
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.notificationService.delete(id)
    return { message: 'Notification successfully deleted' }
  }

  @ApiOperation({ summary: 'Update a notification' })
  @ApiResponse({ status: 200, description: 'Return updated notification' })
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateNotificationBody,
  ) {
    // PATCH only forwards fields the admin actually sent — undefined
    // stays undefined so the service doesn't overwrite columns the
    // admin didn't touch. Validation of "must have at least one path"
    // doesn't apply here: an update can legitimately tweak only
    // is_important or only the params.
    const updateData: Partial<typeof body> = {}
    if (body.title !== undefined) updateData.title = body.title
    if (body.message !== undefined) updateData.message = body.message
    if (body.i18n_key !== undefined) updateData.i18n_key = body.i18n_key
    if (body.i18n_params !== undefined) updateData.i18n_params = body.i18n_params
    if (body.is_important !== undefined)
      updateData.is_important = body.is_important

    return this.notificationService.update(id, updateData, body.user_id)
  }

  // Validates the create-body and returns the persisted shape. Mirrors
  // the SQL CHECK in migrations/add_notifications_i18n.sql so the admin
  // gets a clear 400 with the rule, not a raw Postgres error.
  private assemblePayload(
    body: CreateNotificationBody,
  ): {
    title?: string | null
    message?: string | null
    i18n_key?: string | null
    i18n_params?: NotificationParams | null
    is_important: boolean
  } {
    const hasKey = !!body.i18n_key
    const hasFreeForm = !!body.title && !!body.message
    if (!hasKey && !hasFreeForm) {
      throw new BadRequestException(
        'Provide either i18n_key (typed event) or both title and message (free-form).',
      )
    }
    return {
      title: body.title ?? null,
      message: body.message ?? null,
      i18n_key: body.i18n_key ?? null,
      i18n_params: body.i18n_params ?? null,
      is_important: body.is_important ?? false,
    }
  }
}
