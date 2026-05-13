import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  BadRequestException,
  Header,
} from '@nestjs/common'
import { Request as ExpressRequest } from 'express'
import { AuthGuard } from '@nestjs/passport'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { GiveawaysService } from './giveaways.service'
import { ParticipateGiveawayDto } from './dto'
import { User } from '../users/user.entity'

interface RequestWithUser extends Omit<ExpressRequest, 'user'> {
  user?: User
}

@ApiTags('giveaways')
@Controller('giveaways')
export class GiveawaysController {
  constructor(private readonly giveawaysService: GiveawaysService) {}

  @ApiOperation({ summary: 'Get all giveaways with all information' })
  @ApiResponse({
    status: 200,
    description: 'Return all giveaways with skin and winner information',
  })
  @Get()
  @Header('Cache-Control', 'no-store')
  async getAllGiveaways() {
    return this.giveawaysService.findAll()
  }

  @ApiOperation({ summary: 'Get all active giveaways' })
  @ApiResponse({
    status: 200,
    description: 'Return all active giveaways with skin and winner information',
  })
  @Get('active')
  @Header('Cache-Control', 'no-store')
  async getAllActiveGiveaways() {
    return this.giveawaysService.findAllActive()
  }

  @ApiOperation({ summary: 'Participate in a giveaway' })
  @ApiResponse({
    status: 200,
    description: 'Successfully joined the giveaway',
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - user already participating or requirements not met',
  })
  @ApiResponse({
    status: 404,
    description: 'Giveaway not found',
  })
  @UseGuards(AuthGuard('jwt'))
  @Post('participate')
  async participate(
    @Body() dto: ParticipateGiveawayDto,
    @Req() req: RequestWithUser,
  ) {
    if (!req.user?.id) {
      throw new BadRequestException('User not authenticated')
    }

    return this.giveawaysService.participate(dto.giveaway_id, req.user.id)
  }

  @ApiOperation({ summary: 'Get all winners of completed giveaways' })
  @ApiResponse({
    status: 200,
    description: 'Return all completed giveaways with winners',
  })
  @Get('winners')
  @Header('Cache-Control', 'no-store')
  async getAllWinners() {
    return this.giveawaysService.findAllWinners()
  }
}
