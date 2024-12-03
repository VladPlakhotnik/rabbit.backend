import { Controller, Get, Param, Post, Body } from '@nestjs/common'
import { SectionService } from './section.service'

@Controller('sections')
export class SectionController {
  constructor(private readonly sectionService: SectionService) {}

  @Get()
  async findAll() {
    return this.sectionService.findAll()
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    return this.sectionService.findById(id)
  }

  @Post()
  async create(@Body('name') name: string) {
    return this.sectionService.create(name)
  }
}
