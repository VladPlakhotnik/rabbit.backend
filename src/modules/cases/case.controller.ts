import {
  Controller,
  Get,
  Param,
  Req,
  Post,
  Body,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'
import { CaseService } from './case.service'
import { Roles } from '../../core/decorators/roles.decorator'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../../core/guards/roles.guard'

@Controller('cases')
export class CaseController {
  constructor(private readonly caseService: CaseService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  async findAll() {
    return this.caseService.findAll()
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  async findOne(@Param('id') id: number) {
    const caseEntity = await this.caseService.findById(id)

    const response = {
      id: caseEntity.id,
      name: caseEntity.name,
      img_url: caseEntity.img_url,
      case_price: caseEntity.case_price,
      skins: caseEntity.skinCases.map(skinCase => ({
        id: skinCase.skin.id,
        name: skinCase.skin.name,
        img_url: skinCase.skin.img_url,
        rarity: skinCase.skin.rarity,
        skin_price: skinCase.skin.skin_price,
        chance: skinCase.chance,
        is_drop_out: skinCase.is_drop_out,
      })),
    }

    return response
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/open')
  async openCase(@Param('id') caseId: number, @Req() req: Request) {
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated')
    }
    const userId = req.user.id

    const result = await this.caseService.openCase(caseId, userId)

    return {
      winner: {
        id: result.winner.skin.id,
        name: result.winner.skin.name,
        img_url: result.winner.skin.img_url,
        rarity: result.winner.skin.rarity,
        chance: result.winner.chance,
        skin_price: result.winner.skin.skin_price,
      },
      inventory: {
        id: result.inventory.id,
        obtained_at: result.inventory.obtained_at,
        is_sold: result.inventory.is_sold,
        is_withdrawn: result.inventory.is_withdrawn,
        withdrawn_at: result.inventory.withdrawn_at,
        skin: {
          id: result.inventory.skin.id,
          name: result.inventory.skin.name,
          img_url: result.inventory.skin.img_url,
          rarity: result.inventory.skin.rarity,
          skin_price: result.inventory.skin.skin_price,
        },
        case: {
          id: result.inventory.case.id,
          name: result.inventory.case.name,
          img_url: result.inventory.case.img_url,
          case_price: result.inventory.case.case_price,
        },
      },
    }
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @Post()
  async create(
    @Body('name') name: string,
    @Body('img_url') imgUrl: string,
    @Body('case_price') casePrice: number,
    @Body('section_id') sectionId: number,
  ) {
    const caseData = { name, img_url: imgUrl, case_price: casePrice }
    return this.caseService.create(caseData, sectionId)
  }
}
