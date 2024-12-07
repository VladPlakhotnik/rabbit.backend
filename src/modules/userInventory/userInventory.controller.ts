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
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import { UserInventoryService } from './userInventory.service'
import { AuthGuard } from '@nestjs/passport'
import { Request } from 'express'
import { RolesGuard } from '../../core/guards/roles.guard'
import { Roles } from '../../core/decorators/roles.decorator'
import { User } from '../users/user.entity'

@Controller('inventory')
export class UserInventoryController {
  constructor(private readonly userInventoryService: UserInventoryService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getMyInventory(@Req() req: Request) {
    const user = req.user as User
    const inventories = await this.userInventoryService.getUserInventory(
      user.id,
    )
    return inventories
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  async getUserInventory(@Param('id') id: number) {
    const inventories = await this.userInventoryService.getUserInventory(id)
    if (!inventories || inventories.length === 0) {
      throw new NotFoundException('Inventory not found for user')
    }
    return inventories
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/sell')
  async sellSkin(@Param('id') inventoryId: number, @Req() req: Request) {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated')
    }
    const userId = req.user.id

    const soldItem = await this.userInventoryService.sellSkin(
      inventoryId,
      userId,
    )

    return {
      message: 'Skin sold successfully',
      soldItem: {
        id: soldItem.id,
        skin: {
          id: soldItem.skin.id,
          name: soldItem.skin.name,
          img_url: soldItem.skin.img_url,
          rarity: soldItem.skin.rarity,
          skin_price: Number(soldItem.skin.skin_price),
        },
        obtained_at: soldItem.obtained_at,
        is_sold: soldItem.is_sold,
      },
      updatedBalance: Number(soldItem.user.balance),
    }
  }
}
