import {
  Controller,
  Get,
  Param,
  NotFoundException,
  UseGuards,
  Req,
  Patch,
  Body,
  BadRequestException,
} from '@nestjs/common'
import { UserService } from './users.service'
import { AuthGuard } from '@nestjs/passport'
import { Request } from 'express'
import { User } from './user.entity'
import { RolesGuard } from '../../core/guards/roles.guard'
import { Roles } from '../../core/decorators/roles.decorator'

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Get()
  async findAll() {
    const users = await this.userService.findAll()
    return users
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getProfile(@Req() req: Request) {
    return req.user
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    const user = await this.userService.findById(id)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    const { balance, ...userWithoutBalance } = user
    return userWithoutBalance
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me/inventory')
  async getMyInventory(@Req() req: Request) {
    const user = req.user as User
    const inventories = await this.userService.getUserInventory(user.id)
    return inventories
  }

  @Get(':id/inventory')
  async getUserInventory(@Param('id') id: number) {
    const inventories = await this.userService.getUserInventory(id)
    if (!inventories || inventories.length === 0) {
      throw new NotFoundException('Inventory not found for user')
    }
    return inventories
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('me/trade-link')
  async updateTradeLink(
    @Req() req: Request,
    @Body('trade_link') tradeLink: string,
  ) {
    const user = req.user as User

    if (!tradeLink) {
      throw new BadRequestException('Trade link is required')
    }

    await this.userService.updateTradeLink(user.id, tradeLink)

    return { message: 'Trade link updated successfully' }
  }
}
