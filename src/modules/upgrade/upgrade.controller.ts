import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common'
import { Request } from 'express'
import { AuthGuard } from '@nestjs/passport'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { UpgradeService } from './upgrade.service'
import { UpgradeDto } from './dto/upgrade.dto'
import { User } from '../users/user.entity'

@ApiTags('upgrade')
@Controller('upgrade')
export class UpgradeController {
  constructor(private readonly upgradeService: UpgradeService) {}

  @ApiOperation({ summary: 'Perform skin upgrade' })
  @ApiResponse({ status: 200, description: 'Return upgrade result' })
  @UseGuards(AuthGuard('jwt'))
  @Post()
  async performUpgrade(
    @Body() upgradeDto: UpgradeDto,
    @Req() req: Request & { user?: User },
  ) {
    if (!req.user) {
      throw new UnauthorizedException('User not found')
    }

    if (upgradeDto.use_balance) {
      if (!upgradeDto.upgrade_amount) {
        throw new BadRequestException(
          'upgrade_amount is required when using balance',
        )
      }
    } else {
      if (!upgradeDto.inventory_skin_id) {
        throw new BadRequestException(
          'inventory_skin_id is required when not using balance',
        )
      }
    }

    return this.upgradeService.performUpgrade(req.user.id, upgradeDto)
  }
}
