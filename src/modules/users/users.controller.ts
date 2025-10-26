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
  Logger,
} from '@nestjs/common'
import { UserService } from './users.service'
import { AuthGuard } from '@nestjs/passport'
import { Request } from 'express'
import { User } from './user.entity'
import { RolesGuard } from '../../core/guards/roles.guard'
import { Roles } from '../../core/decorators/roles.decorator'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'

/**
 * Controller for working with users
 * @class UserController
 */

@ApiTags('users')
@Controller('users')
export class UserController {
  private readonly logger = new Logger(UserController.name)

  constructor(private readonly userService: UserService) {}

  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'Return all users' })
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Get()
  async findAll() {
    const users = await this.userService.findAll()
    return users
  }

  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'Return user profile' })
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getProfile(@Req() req: Request) {
    this.logger.log('Getting profile for user')

    return req.user
  }

  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'Return user by ID' })
  //@UseGuards(AuthGuard('jwt'))
  @Get(':id')
  async findOne(@Param('id') id: number) {
    const user = await this.userService.findById(id)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    const { balance, ...userWithoutBalance } = user
    return userWithoutBalance
  }

  @ApiOperation({ summary: 'Update user trade link' })
  @ApiResponse({ status: 200, description: 'Return updated user trade link' })
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

  @ApiOperation({ summary: 'Update current user Steam display name' })
  @ApiResponse({
    status: 200,
    description: 'Steam display name updated successfully',
  })
  @UseGuards(AuthGuard('jwt'))
  @Patch('me/steam-name')
  async updateSteamDisplayName(@Req() req: Request) {
    try {
      const user = req.user as User

      if (user.steam_id) {
        throw new BadRequestException('Steam ID not found')
      }

      const updatedUser = await this.userService.updateSteamDisplayName(user.id)

      return {
        message: 'Steam display name updated successfully',
        user: {
          id: updatedUser.id,
          display_name: updatedUser.display_name,
          steam_id: updatedUser.steam_id,
        },
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error updating Steam display name for user ${req.user?.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
  }

  @ApiOperation({ summary: 'Update current user Steam avatar' })
  @ApiResponse({
    status: 200,
    description: 'Steam avatar updated successfully',
  })
  @UseGuards(AuthGuard('jwt'))
  @Patch('me/steam-avatar')
  async updateSteamAvatar(@Req() req: Request) {
    try {
      const user = req.user as User

      if (!user.steam_id) {
        throw new BadRequestException('Steam ID not found')
      }

      const updatedUser = await this.userService.updateSteamAvatar(user.id)

      return {
        message: 'Steam avatar updated successfully',
        user: {
          id: updatedUser.id,
          avatar: updatedUser.avatar,
          steam_id: updatedUser.steam_id,
        },
      }
    } catch (error) {
      this.logger.error(
        `Error updating Steam avatar for user ${req.user?.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
  }
}
