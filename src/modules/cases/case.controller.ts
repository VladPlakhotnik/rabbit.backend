import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common'
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
    return this.caseService.findById(id)
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
