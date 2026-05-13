import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRole } from '../admin/types/admin-role.enum'
import { AdminWithdrawalListQueryDto } from './dto/admin-withdrawal.dto'
import { WithdrawService } from './withdraw.service'

const READ_ROLES = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
  AdminRole.VIEWER,
] as const

@ApiTags('admin-withdrawals')
@ApiBearerAuth()
@Controller('admin/catalog/withdrawals')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminWithdrawalsController {
  constructor(private readonly withdrawService: WithdrawService) {}

  @Get('overview')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get withdrawal admin metrics' })
  getOverview() {
    return this.withdrawService.getAdminOverview()
  }

  @Get()
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'List withdrawals for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated withdrawals' })
  findAll(@Query() query: AdminWithdrawalListQueryDto) {
    return this.withdrawService.findAllForAdmin(query)
  }

  @Get(':id')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get withdrawal by ID for the admin panel' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.withdrawService.findAdminById(id)
  }
}
