import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { PartnerService } from './partner.service'
import {
  AdminPartnerListQueryDto,
  AdminUpdatePartnerLevelDto,
  AdminUpdatePartnerProfileDto,
} from './dto/admin-partner.dto'

const READ_ROLES = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
  AdminRole.VIEWER,
] as const

@ApiTags('admin-partnership')
@ApiBearerAuth()
@Controller('admin/catalog/partnership')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminPartnersController {
  constructor(private readonly partnerService: PartnerService) {}

  @Get('overview')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get partnership admin overview metrics' })
  @ApiResponse({ status: 200, description: 'Return partnership metrics' })
  getOverview() {
    return this.partnerService.getAdminOverview()
  }

  @Get('levels')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get partnership rate card for the admin panel' })
  getLevels() {
    return this.partnerService.getLevels()
  }

  @Patch('levels/:level')
  @AdminMutation({ entity: 'partner_levels', action: 'update' })
  @ApiOperation({ summary: 'Update a partnership rate-card tier' })
  updateLevel(
    @Param('level', ParseIntPipe) level: number,
    @Body() dto: AdminUpdatePartnerLevelDto,
  ) {
    return this.partnerService.updateLevelForAdmin(level, dto)
  }

  @Get('partners')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'List partner profiles for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated partners' })
  findPartners(@Query() query: AdminPartnerListQueryDto) {
    return this.partnerService.findAllForAdmin(query)
  }

  @Get('partners/:userId')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get partner profile details by user ID' })
  findPartner(@Param('userId', ParseIntPipe) userId: number) {
    return this.partnerService.findAdminByUserId(userId)
  }

  @Patch('partners/:userId')
  @AdminMutation({ entity: 'partner_profiles', action: 'update' })
  @ApiOperation({ summary: 'Update partner profile controls by user ID' })
  updatePartner(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AdminUpdatePartnerProfileDto,
  ) {
    return this.partnerService.updateProfileForAdmin(userId, dto)
  }
}
