import { Controller, Get, Param, Post, Body, Put, Delete } from '@nestjs/common'
import { ClickerCasesService } from './clicker-cases.service'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CreateClickerCaseDto, UpdateClickerCaseDto } from './dto'

@ApiTags('clicker-cases')
@Controller('clicker-cases')
export class ClickerCasesController {
  constructor(private readonly clickerCasesService: ClickerCasesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all clicker cases' })
  findAll() {
    return this.clickerCasesService.findAllCases()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clicker case by ID' })
  findOne(@Param('id') id: number) {
    return this.clickerCasesService.findCaseById(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new clicker case' })
  create(@Body() dto: CreateClickerCaseDto) {
    return this.clickerCasesService.createCase(dto)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a clicker case by ID' })
  update(@Param('id') id: number, @Body() dto: UpdateClickerCaseDto) {
    return this.clickerCasesService.updateCase(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a clicker case by ID' })
  remove(@Param('id') id: number) {
    return this.clickerCasesService.removeCase(id)
  }
}
