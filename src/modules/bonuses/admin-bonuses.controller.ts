import {
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
import { PromoCodeService } from '../promoCodes/promoCode.service'
import { RewardsService } from '../rewards/rewards.service'
import {
  AdminPromoCodeListQueryDto,
  AdminRewardListQueryDto,
  CreateAdminPromoCodeDto,
  CreateAdminRewardDto,
  UpdateAdminPromoCodeDto,
  UpdateAdminRewardDto,
} from './dto/admin-bonus.dto'

const READ_ROLES = [
  AdminRole.SUPER_ADMIN,
  AdminRole.ADMIN,
  AdminRole.MANAGER,
  AdminRole.VIEWER,
] as const

@ApiTags('admin-bonuses')
@ApiBearerAuth()
@Controller('admin/catalog/bonuses')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminBonusesController {
  constructor(
    private readonly promoCodeService: PromoCodeService,
    private readonly rewardsService: RewardsService,
  ) {}

  @Get('overview')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get bonus program admin metrics' })
  async getOverview() {
    const [promoCodes, rewards] = await Promise.all([
      this.promoCodeService.getAdminOverview(),
      this.rewardsService.getAdminOverview(),
    ])

    return { promoCodes, rewards }
  }

  @Get('promo-codes')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'List promo codes for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated promo codes' })
  findPromoCodes(@Query() query: AdminPromoCodeListQueryDto) {
    return this.promoCodeService.findAllForAdmin(query)
  }

  @Get('promo-codes/:code')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get promo code by code for the admin panel' })
  findPromoCode(@Param('code') code: string) {
    return this.promoCodeService.findAdminByCode(code)
  }

  @Post('promo-codes')
  @AdminMutation({ entity: 'promo_codes', action: 'create' })
  @ApiOperation({ summary: 'Create promo code from the admin panel' })
  createPromoCode(@Body() dto: CreateAdminPromoCodeDto) {
    return this.promoCodeService.createAdmin(dto)
  }

  @Patch('promo-codes/:code')
  @AdminMutation({ entity: 'promo_codes', action: 'update' })
  @ApiOperation({ summary: 'Update promo code from the admin panel' })
  updatePromoCode(
    @Param('code') code: string,
    @Body() dto: UpdateAdminPromoCodeDto,
  ) {
    return this.promoCodeService.updateAdmin(code, dto)
  }

  @Delete('promo-codes/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminMutation({ entity: 'promo_codes', action: 'delete' })
  @ApiOperation({ summary: 'Delete promo code from the admin panel' })
  async removePromoCode(@Param('code') code: string): Promise<void> {
    await this.promoCodeService.removeAdmin(code)
  }

  @Get('rewards')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'List bonus wheel rewards for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated rewards' })
  findRewards(@Query() query: AdminRewardListQueryDto) {
    return this.rewardsService.findAllForAdmin(query)
  }

  @Get('rewards/:id')
  @AdminRoles(...READ_ROLES)
  @ApiOperation({ summary: 'Get bonus wheel reward by ID' })
  findReward(@Param('id', ParseIntPipe) id: number) {
    return this.rewardsService.findAdminById(id)
  }

  @Post('rewards')
  @AdminMutation({ entity: 'bonus_rewards', action: 'create' })
  @ApiOperation({ summary: 'Create bonus wheel reward' })
  createReward(@Body() dto: CreateAdminRewardDto) {
    return this.rewardsService.createAdmin(dto)
  }

  @Patch('rewards/:id')
  @AdminMutation({ entity: 'bonus_rewards', action: 'update' })
  @ApiOperation({ summary: 'Update bonus wheel reward' })
  updateReward(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminRewardDto,
  ) {
    return this.rewardsService.updateAdmin(id, dto)
  }

  @Delete('rewards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminMutation({ entity: 'bonus_rewards', action: 'delete' })
  @ApiOperation({ summary: 'Delete bonus wheel reward' })
  async removeReward(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.rewardsService.removeAdmin(id)
  }
}
