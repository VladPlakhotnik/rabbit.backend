import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common'
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
import { CrashService } from './crash.service'
import { AdminCrashListQueryDto } from './dto/admin-crash.dto'

const READ_ROLES = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
  AdminRole.VIEWER,
] as const

@ApiTags('admin-crash')
@ApiBearerAuth()
@Controller('admin/catalog/crash')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminCrashController {
  constructor(private readonly crashService: CrashService) {}

  @Get('settings')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get Crash runtime settings for the admin panel' })
  getSettings() {
    return this.crashService.getAdminSettings()
  }

  @Get('overview')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get Crash admin metrics and live snapshot' })
  @ApiResponse({ status: 200, description: 'Return Crash overview metrics' })
  getOverview() {
    return this.crashService.getAdminOverview()
  }

  @Get('live')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get current Crash live round snapshot' })
  getLiveSnapshot() {
    return this.crashService.getAdminLiveSnapshot()
  }

  @Get('sessions')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'List Crash sessions for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated Crash sessions' })
  findSessions(@Query() query: AdminCrashListQueryDto) {
    return this.crashService.findAllForAdmin(query)
  }

  @Get('sessions/:id')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a Crash session by ID for the admin panel' })
  findSession(@Param('id', ParseIntPipe) id: number) {
    return this.crashService.findAdminById(id)
  }
}
