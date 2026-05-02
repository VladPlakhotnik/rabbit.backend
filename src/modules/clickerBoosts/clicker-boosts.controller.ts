import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthGuard } from '@nestjs/passport'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'
import type { Request } from 'express'
import { ClickerBoostsService } from './clicker-boosts.service'

interface RequestWithUser extends Omit<Request, 'user'> {
  user: { id: number }
}

class BuyBoostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  boost_key!: string
}

/**
 * Public catalog read + per-player inventory + buy. Activate lives on
 * the WebSocket gateway (PR6) because activation needs to coordinate
 * with the click pipeline; buy is just a balance debit + counter
 * increment, fine over REST.
 */
@ApiTags('clicker-boosts')
@Controller('clicker-boosts')
export class ClickerBoostsController {
  constructor(private readonly service: ClickerBoostsService) {}

  @Get()
  @ApiOperation({ summary: 'Public catalog of available consumable boosts' })
  @ApiResponse({ status: 200, description: 'Boost catalog' })
  findCatalog() {
    return this.service.findCatalog()
  }

  @Get('inventory/me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Stockpile of the authenticated player' })
  @ApiResponse({ status: 200, description: 'Per-key boost counts' })
  findMyInventory(@Req() req: RequestWithUser) {
    return this.service.findInventory(req.user.id)
  }

  /**
   * Buy a single copy of `boost_key`. Per-IP rate-limit (3/sec) cuts
   * automated bursts; the actual race-safety is the pessimistic write
   * lock inside `service.buy`.
   */
  @Throttle({ default: { ttl: 1_000, limit: 3 } })
  @UseGuards(AuthGuard('jwt'))
  @Post('buy')
  @ApiOperation({ summary: 'Buy one copy of a boost' })
  @ApiResponse({ status: 200, description: 'New count + updated points' })
  buy(@Req() req: RequestWithUser, @Body() body: BuyBoostDto) {
    const ip =
      (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
        req.socket?.remoteAddress) ??
      null
    return this.service.buy(req.user.id, body.boost_key, ip)
  }
}
