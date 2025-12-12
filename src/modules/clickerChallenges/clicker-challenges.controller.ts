import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common'
import { ClickerChallengesService } from './clicker-challenges.service'
import { Roles } from '../../core/decorators/roles.decorator'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../../core/guards/roles.guard'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { UpdateChallengeConditionDto } from './dto/update-challenge-condition.dto'

@ApiTags('clicker-challenges')
@Controller('clicker-challenges')
export class ClickerChallengesController {
  constructor(
    private readonly clickerChallengesService: ClickerChallengesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all clicker challenges' })
  @ApiResponse({ status: 200, description: 'Return all clicker challenges' })
  findAll() {
    return this.clickerChallengesService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clicker challenge by ID' })
  @ApiResponse({ status: 200, description: 'Return clicker challenge by ID' })
  findOne(@Param('id') id: number) {
    return this.clickerChallengesService.findById(id)
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new clicker challenge' })
  @ApiResponse({
    status: 201,
    description: 'Clicker challenge created successfully',
  })
  create(@Body() data: any) {
    return this.clickerChallengesService.create(data)
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Update a clicker challenge by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker challenge updated successfully',
  })
  update(@Param('id') id: number, @Body() data: any) {
    return this.clickerChallengesService.update(id, data)
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a clicker challenge by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker challenge deleted successfully',
  })
  remove(@Param('id') id: number) {
    return this.clickerChallengesService.remove(id)
  }

  @Put(':id/condition')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Update challenge condition' })
  @ApiResponse({
    status: 200,
    description: 'Challenge condition updated successfully',
  })
  updateCondition(
    @Param('id') id: number,
    @Body() conditionData: UpdateChallengeConditionDto,
  ) {
    return this.clickerChallengesService.updateCondition(id, conditionData)
  }
}
