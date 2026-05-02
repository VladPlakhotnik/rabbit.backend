import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common'
import { ClickerUserService } from './clicker-user.service'
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { Request as ExpressRequest } from 'express'

interface RequestWithUser extends Omit<ExpressRequest, 'user'> {
  user: {
    id: number
    steam_id: number
    display_name: string
    role: string
    avatar: string
    opened_cases: number
    upgraded_skins: number
    deposit_amount: number
    withdrawal_amount: number
    rank: string
    balance: number
    profile_url: string
    trade_link: string | null
    created_at: Date
    referral_parent_id: number | null
  }
}

@ApiTags('clicker-users')
@Controller('clicker-users')
export class ClickerUserController {
  constructor(private readonly clickerUserService: ClickerUserService) {}

  @Get()
  @ApiOperation({ summary: 'Get all clicker users' })
  findAll() {
    return this.clickerUserService.findAll()
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get current user clicker profile' })
  @ApiResponse({
    status: 200,
    description: 'Returns the current user clicker profile (lazy-created on first hit)',
  })
  async getCurrentUserProfile(@Request() req: RequestWithUser) {
    // Lazy creation: the clicker profile no longer exists at registration
    // time. The first time a player opens the clicker tab, this endpoint
    // (or the click bootstrap) materialises the row.
    return this.clickerUserService.findOrCreateByUserId(req.user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clicker user by ID' })
  findOne(@Param('id') id: number) {
    return this.clickerUserService.findById(id)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a clicker user by ID' })
  update(@Param('id') id: number, @Body() data: any) {
    return this.clickerUserService.update(id, data)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a clicker user by ID' })
  remove(@Param('id') id: number) {
    return this.clickerUserService.remove(id)
  }
}
