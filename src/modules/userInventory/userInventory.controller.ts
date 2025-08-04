import {
  Controller,
  Get,
  Param,
  NotFoundException,
  UseGuards,
  Req,
  BadRequestException,
  Post,
  UnauthorizedException,
  Logger,
  Body,
} from '@nestjs/common'
import { SoldItem, UserInventoryService } from './userInventory.service'
import { AuthGuard } from '@nestjs/passport'
import { Request } from 'express'
import { User } from '../users/user.entity'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'

interface SellSkinResponse {
  message: string
  soldItem: {
    id: number
    skin: {
      id: number
      name: string
      img_url: string
      rarity: string
      skin_price: number
    }
    obtained_at: Date
    is_sold: boolean
  }
  updatedBalance: number
}

interface SellAllResponse {
  message: string
  soldItems: SoldItem[]
  updatedBalance: number
}

interface SellSelectedRequest {
  inventory_ids: number[]
}

interface SellSelectedResponse {
  message: string
  soldItems: SoldItem[]
  updatedBalance: number
}

/**
 * Controller for working with user inventory
 * @class UserInventoryController
 */

@ApiTags('inventory')
@Controller('inventory')
export class UserInventoryController {
  private readonly logger = new Logger(UserInventoryController.name)

  constructor(private readonly userInventoryService: UserInventoryService) {}

  @ApiOperation({ summary: 'Get current user inventory' })
  @ApiResponse({ status: 200, description: 'Return current user inventory' })
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getMyInventory(@Req() req: Request) {
    try {
      const user = req.user as User
      const inventories = await this.userInventoryService.getUserInventory(
        user.id,
      )
      return inventories
    } catch (error: unknown) {
      this.logger.error(
        `Error getting inventory for user ${req.user?.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
  }

  @ApiOperation({ summary: 'Get inventory by user ID' })
  @ApiResponse({ status: 200, description: 'Return inventory by user ID' })
  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  async getUserInventory(@Param('id') id: number) {
    if (!id) {
      throw new BadRequestException('User ID is required')
    }
    const inventories = await this.userInventoryService.getUserInventory(id)
    if (!inventories || inventories.length === 0) {
      throw new NotFoundException('Inventory not found for user')
    }
    return inventories
  }

  @ApiOperation({ summary: 'Sell a skin' })
  @ApiResponse({ status: 200, description: 'Return sold skin' })
  @UseGuards(AuthGuard('jwt'))
  @Post(':id/sell')
  async sellSkin(
    @Param('id') inventoryId: number,
    @Req() req: Request,
  ): Promise<SellSkinResponse> {
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

  @ApiOperation({ summary: 'Sell all skins' })
  @ApiResponse({ status: 200, description: 'Return all skins sold' })
  @UseGuards(AuthGuard('jwt'))
  @Post('sell-all')
  async sellAllSkins(@Req() req: Request): Promise<SellAllResponse> {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated')
    }
    const userId = req.user.id

    const { soldItems, updatedBalance } =
      await this.userInventoryService.sellAllSkins(userId)

    return {
      message: 'All skins already sold',
      soldItems,
      updatedBalance,
    }
  }

  @ApiOperation({ summary: 'Sell selected skins' })
  @ApiResponse({ status: 200, description: 'Return selected skins sold' })
  @UseGuards(AuthGuard('jwt'))
  @Post('sell-selected')
  async sellSelectedSkins(
    @Body() body: SellSelectedRequest,
    @Req() req: Request,
  ): Promise<SellSelectedResponse> {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated')
    }
    const userId = req.user.id

    const { soldItems, updatedBalance } =
      await this.userInventoryService.sellSelectedSkins(
        body.inventory_ids,
        userId,
      )

    return {
      message: 'Selected skins sold successfully',
      soldItems,
      updatedBalance,
    }
  }
}
