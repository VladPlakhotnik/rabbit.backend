import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { Throttle } from '@nestjs/throttler'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { Request } from 'express'

import { UserThrottlerGuard } from '../../core/guards/user-throttler.guard'
import { User } from '../users/user.entity'
import { CreateSkinsbackDepositDto } from './dto/create-skinsback-deposit.dto'
import { SkinsbackService } from './skinsback.service'

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly skinsbackService: SkinsbackService) {}

  @Post('skinsback/deposits')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a Skinsback skin deposit' })
  @ApiResponse({ status: 201, description: 'Returns Skinsback payment URL' })
  async createSkinsbackDeposit(
    @Req() req: Request,
    @Body() body: CreateSkinsbackDepositDto,
  ) {
    const user = req.user as User

    return this.skinsbackService.createDeposit(user.id, body)
  }

  @Post('skinsback/webhook')
  @ApiOperation({ summary: 'Handle Skinsback deposit webhook' })
  async handleSkinsbackWebhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: Record<string, unknown>,
  ) {
    return this.skinsbackService.handleWebhook(headers, body)
  }
}
