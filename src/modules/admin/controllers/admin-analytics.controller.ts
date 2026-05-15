import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AdminRoles } from '../decorators/admin-roles.decorator'
import { AdminJwtGuard } from '../guards/admin-jwt.guard'
import { AdminRolesGuard } from '../guards/admin-roles.guard'
import { AdminAnalyticsService } from '../services/admin-analytics.service'
import { AdminRole } from '../types/admin-role.enum'

const ANALYTICS_ROLES = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
  AdminRole.VIEWER,
  AdminRole.INVESTOR,
] as const

@ApiTags('admin-analytics')
@ApiBearerAuth()
@Controller('admin/analytics')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get('investor')
  @AdminRoles(...ANALYTICS_ROLES)
  @ApiOperation({
    summary: 'Investment-grade analytics summary for the admin panel',
  })
  getInvestorAnalytics() {
    return this.analytics.getInvestorAnalytics()
  }

  @Get('summary')
  @AdminRoles(...ANALYTICS_ROLES)
  @ApiOperation({
    summary: 'Owner and investor analytics summary for dashboard pages',
  })
  getSummary(@Query('timezone') timezone?: string) {
    return this.analytics.getSummary(timezone)
  }
}
