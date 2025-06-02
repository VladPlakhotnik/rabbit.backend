import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common'
import { ClickerEnergyLevelsService } from './clicker-energy-levels.service'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

@ApiTags('clicker-energy-levels')
@Controller('clicker-energy-levels')
export class ClickerEnergyLevelsController {
  constructor(
    private readonly clickerEnergyLevelsService: ClickerEnergyLevelsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all clicker energy levels' })
  @ApiResponse({ status: 200, description: 'Return all clicker energy levels' })
  findAll() {
    return this.clickerEnergyLevelsService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clicker energy level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Return clicker energy level by ID',
  })
  findOne(@Param('id') id: number) {
    return this.clickerEnergyLevelsService.findById(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new clicker energy level' })
  @ApiResponse({
    status: 201,
    description: 'Clicker energy level created successfully',
  })
  create(@Body() data: any) {
    return this.clickerEnergyLevelsService.create(data)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a clicker energy level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker energy level updated successfully',
  })
  update(@Param('id') id: number, @Body() data: any) {
    return this.clickerEnergyLevelsService.update(id, data)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a clicker energy level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker energy level deleted successfully',
  })
  remove(@Param('id') id: number) {
    return this.clickerEnergyLevelsService.remove(id)
  }
}
