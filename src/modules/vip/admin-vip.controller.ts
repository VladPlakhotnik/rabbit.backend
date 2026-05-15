import { Controller, Get, Query, UseGuards } from '@nestjs/common'
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
import { AdminVipService } from './admin-vip.service'
import {
  AdminVipClaimsQueryDto,
  AdminVipLedgerQueryDto,
} from './dto/admin-vip.dto'

const READ_ROLES = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
  AdminRole.VIEWER,
] as const

@ApiTags('admin-vip')
@ApiBearerAuth()
@Controller('admin/catalog/vip')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminVipController {
  constructor(private readonly adminVipService: AdminVipService) {}

  @Get('overview')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get VIP admin overview metrics' })
  @ApiResponse({ status: 200, description: 'Return VIP overview metrics' })
  getOverview() {
    return this.adminVipService.getOverview()
  }

  @Get('ledger')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'List VIP XP ledger entries for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated VIP ledger entries' })
  listLedger(@Query() query: AdminVipLedgerQueryDto) {
    return this.adminVipService.listLedger(query)
  }

  @Get('claims')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'List VIP reward claims for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated VIP reward claims' })
  listClaims(@Query() query: AdminVipClaimsQueryDto) {
    return this.adminVipService.listClaims(query)
  }
}
