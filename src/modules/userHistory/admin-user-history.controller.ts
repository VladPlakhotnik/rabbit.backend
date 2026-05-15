import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { normalizePagination } from '../../common/pagination'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRole } from '../admin/types/admin-role.enum'
import { UserHistoryService } from './userHistory.service'

@ApiTags('admin-user-history')
@ApiBearerAuth()
@Controller('admin/catalog/users/:userId/history')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminUserHistoryController {
  constructor(private readonly userHistoryService: UserHistoryService) {}

  @AdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
    AdminRole.MANAGER,
    AdminRole.VIEWER,
  )
  @ApiOperation({ summary: 'List user case history for admin profile page' })
  @Get('cases')
  findCaseHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userHistoryService.getCaseHistory(
      userId,
      normalizePagination({ page, limit }),
    )
  }

  @AdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
    AdminRole.MANAGER,
    AdminRole.VIEWER,
  )
  @ApiOperation({ summary: 'List user upgrade history for admin profile page' })
  @Get('upgrades')
  findUpgradeHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userHistoryService.getUpgradeHistory(
      userId,
      normalizePagination({ page, limit }),
    )
  }

  @AdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
    AdminRole.MANAGER,
    AdminRole.VIEWER,
  )
  @ApiOperation({ summary: 'List user crash history for admin profile page' })
  @Get('crash')
  findCrashHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.userHistoryService.getCrashHistory(
      userId,
      normalizePagination({ page, limit }),
    )
  }
}
