import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common'
import { ClickerLevelsService } from './clicker-levels.service'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

@ApiTags('clicker-levels')
@Controller('clicker-levels')
export class ClickerLevelsController {
  constructor(private readonly clickerLevelsService: ClickerLevelsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all clicker levels' })
  @ApiResponse({ status: 200, description: 'Return all clicker levels' })
  findAll() {
    return this.clickerLevelsService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clicker level by ID' })
  @ApiResponse({ status: 200, description: 'Return clicker level by ID' })
  findOne(@Param('id') id: number) {
    return this.clickerLevelsService.findById(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new clicker level' })
  @ApiResponse({
    status: 201,
    description: 'Clicker level created successfully',
  })
  create(@Body() data: any) {
    return this.clickerLevelsService.create(data)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a clicker level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker level updated successfully',
  })
  update(@Param('id') id: number, @Body() data: any) {
    return this.clickerLevelsService.update(id, data)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a clicker level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker level deleted successfully',
  })
  remove(@Param('id') id: number) {
    return this.clickerLevelsService.remove(id)
  }
}
