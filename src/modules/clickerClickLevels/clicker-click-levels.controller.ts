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
import { ClickerClickLevelsService } from './clicker-click-levels.service'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AdminMutation } from '../admin/decorators/admin-mutation.decorator'
import { CLICKER_CATALOG_CACHE_CONTROL } from '../clickerUser/constants/clicker-catalog-cache.constants'
import {
  CreateClickerClickLevelDto,
  UpdateClickerClickLevelDto,
} from './dto/clicker-click-level.dto'

@ApiTags('clicker-click-levels')
@Controller('clicker-click-levels')
export class ClickerClickLevelsController {
  constructor(
    private readonly clickerClickLevelsService: ClickerClickLevelsService,
  ) {}

  @Get()
  @Header('Cache-Control', CLICKER_CATALOG_CACHE_CONTROL)
  @ApiOperation({ summary: 'Get all clicker click levels' })
  @ApiResponse({
    status: 200,
    description: 'Return all clicker click levels',
  })
  findAll() {
    return this.clickerClickLevelsService.findAll()
  }

  @Get(':id')
  @Header('Cache-Control', CLICKER_CATALOG_CACHE_CONTROL)
  @ApiOperation({ summary: 'Get clicker click level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Return clicker click level by ID',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clickerClickLevelsService.findById(id)
  }

  @Post()
  @AdminMutation({ entity: 'clicker_click_levels', action: 'create' })
  @ApiOperation({ summary: 'Create a new clicker click level' })
  @ApiResponse({
    status: 201,
    description: 'Clicker click level created successfully',
  })
  create(@Body() data: CreateClickerClickLevelDto) {
    return this.clickerClickLevelsService.create(data)
  }

  @Put(':id')
  @AdminMutation({ entity: 'clicker_click_levels', action: 'update' })
  @ApiOperation({ summary: 'Update a clicker click level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker click level updated successfully',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateClickerClickLevelDto,
  ) {
    return this.clickerClickLevelsService.update(id, data)
  }

  @Delete(':id')
  @AdminMutation({ entity: 'clicker_click_levels', action: 'delete' })
  @ApiOperation({ summary: 'Delete a clicker click level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker click level deleted successfully',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clickerClickLevelsService.remove(id)
  }
}
