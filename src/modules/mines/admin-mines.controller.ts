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
import { AdminMinesListQueryDto } from './dto/admin-mines.dto'
import { MinesService } from './mines.service'

const READ_ROLES = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
  AdminRole.VIEWER,
] as const

@ApiTags('admin-mines')
@ApiBearerAuth()
@Controller('admin/catalog/mines')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminMinesController {
  constructor(private readonly minesService: MinesService) {}

  @Get('settings')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get Mines runtime settings for the admin panel' })
  getSettings() {
    return this.minesService.getAdminSettings()
  }

  @Get('overview')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get Mines admin metrics and settings' })
  @ApiResponse({ status: 200, description: 'Return Mines overview metrics' })
  getOverview() {
    return this.minesService.getAdminOverview()
  }

  @Get('sessions')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'List Mines sessions for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated Mines sessions' })
  findSessions(@Query() query: AdminMinesListQueryDto) {
    return this.minesService.findAllForAdmin(query)
  }

  @Get('sessions/:id')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a Mines session by ID for the admin panel' })
  findSession(@Param('id', ParseIntPipe) id: number) {
    return this.minesService.findAdminById(id)
  }
}
