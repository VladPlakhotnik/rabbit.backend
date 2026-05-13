import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRole } from '../admin/types/admin-role.enum'
import { AdminUpgradeListQueryDto } from './dto/admin-upgrade.dto'
import { UpgradeService } from './upgrade.service'

const READ_ROLES = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
  AdminRole.VIEWER,
] as const

@ApiTags('admin-upgrades')
@ApiBearerAuth()
@Controller('admin/catalog/upgrades')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminUpgradeController {
  constructor(private readonly upgradeService: UpgradeService) {}

  @Get('settings')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get Upgrade runtime settings for the admin panel' })
  getSettings() {
    return this.upgradeService.getAdminSettings()
  }

  @Get('overview')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get Upgrade admin metrics and settings' })
  @ApiResponse({ status: 200, description: 'Return Upgrade overview metrics' })
  getOverview() {
    return this.upgradeService.getAdminOverview()
  }

  @Get('attempts')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'List Upgrade attempts for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated Upgrade attempts' })
  findAttempts(@Query() query: AdminUpgradeListQueryDto) {
    return this.upgradeService.findAllForAdmin(query)
  }

  @Get('attempts/:id')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get an Upgrade attempt by ID for the admin panel' })
  findAttempt(@Param('id', ParseIntPipe) id: number) {
    return this.upgradeService.findAdminById(id)
  }
}
