import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common'
import { ClickerClickLevelsService } from './clicker-click-levels.service'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

@ApiTags('clicker-click-levels')
@Controller('clicker-click-levels')
export class ClickerClickLevelsController {
  constructor(
    private readonly clickerClickLevelsService: ClickerClickLevelsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all clicker click levels' })
  @ApiResponse({
    status: 200,
    description: 'Return all clicker click levels',
  })
  findAll() {
    return this.clickerClickLevelsService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clicker click level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Return clicker click level by ID',
  })
  findOne(@Param('id') id: number) {
    return this.clickerClickLevelsService.findById(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new clicker click level' })
  @ApiResponse({
    status: 201,
    description: 'Clicker click level created successfully',
  })
  create(@Body() data: any) {
    return this.clickerClickLevelsService.create(data)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a clicker click level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker click level updated successfully',
  })
  update(@Param('id') id: number, @Body() data: any) {
    return this.clickerClickLevelsService.update(id, data)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a clicker click level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker click level deleted successfully',
  })
  remove(@Param('id') id: number) {
    return this.clickerClickLevelsService.remove(id)
  }
}
