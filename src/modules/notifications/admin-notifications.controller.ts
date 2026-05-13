import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { AdminMutation } from '../admin/decorators/admin-mutation.decorator'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRole } from '../admin/types/admin-role.enum'
import type { NotificationParams } from './entities/notification.entity'
import {
  AdminNotificationListQueryDto,
  AdminNotificationPayloadDto,
} from './dto/admin-notification.dto'
import { NotificationService } from './notification.service'

type NotificationPayload = {
  i18n_key?: string | null
  i18n_params?: NotificationParams | null
  is_important: boolean
  message?: string | null
  title?: string | null
}

const normalizeText = (value: string | null | undefined): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

@ApiTags('admin-notifications')
@ApiBearerAuth()
@Controller('admin/catalog/notifications')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminNotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @AdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
    AdminRole.MANAGER,
    AdminRole.VIEWER,
  )
  @ApiOperation({ summary: 'List notifications for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated notifications' })
  findAll(@Query() query: AdminNotificationListQueryDto) {
    return this.notificationService.findAllForAdmin(query)
  }

  @Get(':id')
  @AdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
    AdminRole.MANAGER,
    AdminRole.VIEWER,
  )
  @ApiOperation({ summary: 'Get notification by ID for the admin panel' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.notificationService.findAdminById(id)
  }

  @Post()
  @AdminMutation({ entity: 'notifications', action: 'create' })
  @ApiOperation({ summary: 'Create a notification from the admin panel' })
  create(@Body() body: AdminNotificationPayloadDto) {
    const notificationData = this.assembleCreatePayload(body)
    return this.notificationService.create(
      notificationData,
      body.user_id ?? null,
    )
  }

  @Patch(':id')
  @AdminMutation({ entity: 'notifications', action: 'update' })
  @ApiOperation({ summary: 'Update a notification from the admin panel' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminNotificationPayloadDto,
  ) {
    const updateData = this.assembleUpdatePayload(body)
    return this.notificationService.update(id, updateData, body.user_id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminMutation({ entity: 'notifications', action: 'delete' })
  @ApiOperation({ summary: 'Delete a notification from the admin panel' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.notificationService.delete(id)
  }

  private assembleCreatePayload(
    body: AdminNotificationPayloadDto,
  ): NotificationPayload {
    const title = normalizeText(body.title)
    const message = normalizeText(body.message)
    const i18nKey = normalizeText(body.i18n_key)
    const hasKey = Boolean(i18nKey)
    const hasFreeForm = Boolean(title && message)

    if (!hasKey && !hasFreeForm) {
      throw new BadRequestException(
        'Provide either i18n_key or both title and message.',
      )
    }

    return {
      i18n_key: i18nKey,
      i18n_params: this.normalizeParams(body.i18n_params) ?? null,
      is_important: body.is_important ?? false,
      message,
      title,
    }
  }

  private assembleUpdatePayload(
    body: AdminNotificationPayloadDto,
  ): Partial<NotificationPayload> {
    const updateData: Partial<NotificationPayload> = {}
    if (body.title !== undefined) updateData.title = normalizeText(body.title)
    if (body.message !== undefined)
      updateData.message = normalizeText(body.message)
    if (body.i18n_key !== undefined)
      updateData.i18n_key = normalizeText(body.i18n_key)
    if (body.i18n_params !== undefined)
      updateData.i18n_params = this.normalizeParams(body.i18n_params)
    if (body.is_important !== undefined)
      updateData.is_important = body.is_important

    return updateData
  }

  private normalizeParams(
    params: AdminNotificationPayloadDto['i18n_params'],
  ): NotificationParams | null | undefined {
    if (params === undefined) return undefined
    if (params === null) return null

    for (const [key, value] of Object.entries(params)) {
      if (
        value !== null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        throw new BadRequestException(
          `i18n_params.${key} must be a string, number, boolean, or null.`,
        )
      }
    }

    return params
  }
}
