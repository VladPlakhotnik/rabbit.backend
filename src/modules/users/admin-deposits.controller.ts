import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRole } from '../admin/types/admin-role.enum'
import { AdminDepositListQueryDto } from './dto/admin-deposit.dto'
import { UserService } from './users.service'

const READ_ROLES = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
  AdminRole.VIEWER,
] as const

@ApiTags('admin-deposits')
@ApiBearerAuth()
@Controller('admin/catalog/deposits')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminDepositsController {
  constructor(private readonly userService: UserService) {}

  @Get('overview')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get deposit admin metrics' })
  getOverview() {
    return this.userService.getDepositsAdminOverview()
  }

  @Get()
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'List deposits for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated deposits' })
  findAll(@Query() query: AdminDepositListQueryDto) {
    return this.userService.findDepositsForAdmin(query)
  }

  @Get(':id')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get deposit by ID for the admin panel' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findDepositAdminById(id)
  }
}
