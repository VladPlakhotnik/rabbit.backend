import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common'
import { ClickerLevelsService } from './clicker-levels.service'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AdminMutation } from '../admin/decorators/admin-mutation.decorator'
import { CLICKER_CATALOG_CACHE_CONTROL } from '../clickerUser/constants/clicker-catalog-cache.constants'
import {
  CreateClickerLevelDto,
  UpdateClickerLevelDto,
} from './dto/clicker-level.dto'

@ApiTags('clicker-levels')
@Controller('clicker-levels')
export class ClickerLevelsController {
  constructor(private readonly clickerLevelsService: ClickerLevelsService) {}

  @Get()
  @Header('Cache-Control', CLICKER_CATALOG_CACHE_CONTROL)
  @ApiOperation({ summary: 'Get all clicker levels' })
  @ApiResponse({ status: 200, description: 'Return all clicker levels' })
  findAll() {
    return this.clickerLevelsService.findAll()
  }

  @Get(':id')
  @Header('Cache-Control', CLICKER_CATALOG_CACHE_CONTROL)
  @ApiOperation({ summary: 'Get clicker level by ID' })
  @ApiResponse({ status: 200, description: 'Return clicker level by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clickerLevelsService.findById(id)
  }

  @Post()
  @AdminMutation({ entity: 'clicker_levels', action: 'create' })
  @ApiOperation({ summary: 'Create a new clicker level' })
  @ApiResponse({
    status: 201,
    description: 'Clicker level created successfully',
  })
  create(@Body() data: CreateClickerLevelDto) {
    return this.clickerLevelsService.create(data)
  }

  @Put(':id')
  @AdminMutation({ entity: 'clicker_levels', action: 'update' })
  @ApiOperation({ summary: 'Update a clicker level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker level updated successfully',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateClickerLevelDto,
  ) {
    return this.clickerLevelsService.update(id, data)
  }

  @Delete(':id')
  @AdminMutation({ entity: 'clicker_levels', action: 'delete' })
  @ApiOperation({ summary: 'Delete a clicker level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker level deleted successfully',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clickerLevelsService.remove(id)
  }
}
