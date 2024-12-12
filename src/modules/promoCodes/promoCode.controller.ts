// src/promoCodes/promoCode.controller.ts

import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'
import { PromoCodeService } from './promoCode.service'
import { AuthGuard } from '@nestjs/passport'

@Controller('promocodes')
@UseGuards(AuthGuard('jwt'))
export class PromoCodeController {
  constructor(private readonly promoCodeService: PromoCodeService) {}

  @Post('activate')
  async activatePromoCode(@Body('code') code: string, @Req() req: Request) {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated')
    }

    const user = req.user

    if (!code) {
      throw new BadRequestException('Promo code is required')
    }

    return await this.promoCodeService.activatePromoCode(code, user.id)
  }
}
