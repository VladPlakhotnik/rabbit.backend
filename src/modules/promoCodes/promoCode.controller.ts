import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common'
import { PromoCodeService } from './promoCode.service'
import { PromoCodeStatus, PromoCodeType } from './entities/promoCode.entity'
import { RewardType } from './entities/promoCodeReward.entity'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../../core/guards/roles.guard'
import { Roles } from '../../core/decorators/roles.decorator'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'

class CreatePromoCodeDto {
  code!: string
  type!: PromoCodeType
  rewards!: {
    reward_type: RewardType
    value: number
    skin_id?: number
    min_deposit?: number
    max_bonus?: number
    is_demo?: boolean
  }[]
  description?: string
  max_uses?: number
  expires_at?: Date
}

export class UpdatePromoCodeDto {
  code?: string
  type?: PromoCodeType
  status?: PromoCodeStatus
  description?: string
  max_uses?: number
  expires_at?: Date
  rewards?: {
    reward_type: RewardType
    value: number
    skin_id?: number
    min_deposit?: number
    max_bonus?: number
    is_demo?: boolean
  }[]
}

@ApiTags('promo-codes')
@Controller('promo-codes')
export class PromoCodeController {
  constructor(private readonly promoCodeService: PromoCodeService) {}

  @ApiOperation({ summary: 'Get all promo codes' })
  @ApiResponse({ status: 200, description: 'Returns all promo codes' })
  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  async findAll() {
    return this.promoCodeService.findAll()
  }

  @ApiOperation({ summary: 'Create a new promo code' })
  @ApiResponse({ status: 201, description: 'Returns the created promo code' })
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  async create(@Body() createPromoCodeDto: CreatePromoCodeDto) {
    return this.promoCodeService.create(
      createPromoCodeDto.code,
      createPromoCodeDto.type,
      createPromoCodeDto.rewards,
      createPromoCodeDto.description,
      createPromoCodeDto.max_uses,
      createPromoCodeDto.expires_at,
    )
  }

  @ApiOperation({ summary: 'Update promo code' })
  @ApiResponse({ status: 200, description: 'Returns updated promo code' })
  @Patch(':code')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  async update(
    @Param('code') code: string,
    @Body() updatePromoCodeDto: UpdatePromoCodeDto,
  ) {
    return this.promoCodeService.update(code, updatePromoCodeDto)
  }

  @ApiOperation({ summary: 'Activate a promo code' })
  @ApiResponse({ status: 200, description: 'Returns the activated promo code' })
  @Post('activate/:code')
  @UseGuards(AuthGuard('jwt'))
  async activate(
    @Param('code') code: string,
    @Request() req: { user?: { id: number } },
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }
    return this.promoCodeService.activate(code, req.user.id)
  }

  @ApiOperation({ summary: 'Deactivate a promo code' })
  @ApiResponse({
    status: 200,
    description: 'Returns the deactivated promo code',
  })
  @Post('deactivate/:code')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  async deactivate(@Param('code') code: string) {
    return this.promoCodeService.deactivate(code)
  }
}
