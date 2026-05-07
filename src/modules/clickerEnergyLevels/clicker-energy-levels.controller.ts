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
import { ClickerEnergyLevelsService } from './clicker-energy-levels.service'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AdminMutation } from '../admin/decorators/admin-mutation.decorator'
import { CLICKER_CATALOG_CACHE_CONTROL } from '../clickerUser/constants/clicker-catalog-cache.constants'
import {
  CreateClickerEnergyLevelDto,
  UpdateClickerEnergyLevelDto,
} from './dto/clicker-energy-level.dto'

@ApiTags('clicker-energy-levels')
@Controller('clicker-energy-levels')
export class ClickerEnergyLevelsController {
  constructor(
    private readonly clickerEnergyLevelsService: ClickerEnergyLevelsService,
  ) {}

  @Get()
  @Header('Cache-Control', CLICKER_CATALOG_CACHE_CONTROL)
  @ApiOperation({ summary: 'Get all clicker energy levels' })
  @ApiResponse({ status: 200, description: 'Return all clicker energy levels' })
  findAll() {
    return this.clickerEnergyLevelsService.findAll()
  }

  @Get(':id')
  @Header('Cache-Control', CLICKER_CATALOG_CACHE_CONTROL)
  @ApiOperation({ summary: 'Get clicker energy level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Return clicker energy level by ID',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clickerEnergyLevelsService.findById(id)
  }

  @Post()
  @AdminMutation({ entity: 'clicker_energy_levels', action: 'create' })
  @ApiOperation({ summary: 'Create a new clicker energy level' })
  @ApiResponse({
    status: 201,
    description: 'Clicker energy level created successfully',
  })
  create(@Body() data: CreateClickerEnergyLevelDto) {
    return this.clickerEnergyLevelsService.create(data)
  }

  @Put(':id')
  @AdminMutation({ entity: 'clicker_energy_levels', action: 'update' })
  @ApiOperation({ summary: 'Update a clicker energy level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker energy level updated successfully',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: UpdateClickerEnergyLevelDto,
  ) {
    return this.clickerEnergyLevelsService.update(id, data)
  }

  @Delete(':id')
  @AdminMutation({ entity: 'clicker_energy_levels', action: 'delete' })
  @ApiOperation({ summary: 'Delete a clicker energy level by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker energy level deleted successfully',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clickerEnergyLevelsService.remove(id)
  }
}
