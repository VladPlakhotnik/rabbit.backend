import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { ClickerChallengesService } from './clicker-challenges.service'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminRole } from '../admin/types/admin-role.enum'
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { UpdateChallengeConditionDto } from './dto/update-challenge-condition.dto'

interface RequestWithUser {
  user: { id: number }
}

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

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get current user clicker challenge progress' })
  @ApiResponse({
    status: 200,
    description: 'Return active clicker challenges with user progress',
  })
  findMine(@Req() req: RequestWithUser) {
    return this.clickerChallengesService.findForUser(req.user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clicker challenge by ID' })
  @ApiResponse({ status: 200, description: 'Return clicker challenge by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clickerChallengesService.findById(id)
  }

  @Post(':id/claim')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Claim completed clicker challenge reward' })
  @ApiResponse({
    status: 201,
    description: 'Challenge reward claimed successfully',
  })
  claim(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.clickerChallengesService.claimReward(req.user.id, id)
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Create a new clicker challenge' })
  @ApiResponse({
    status: 201,
    description: 'Clicker challenge created successfully',
  })
  create(@Body() data: any) {
    return this.clickerChallengesService.create(data)
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update a clicker challenge by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker challenge updated successfully',
  })
  update(@Param('id', ParseIntPipe) id: number, @Body() data: any) {
    return this.clickerChallengesService.update(id, data)
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Delete a clicker challenge by ID' })
  @ApiResponse({
    status: 200,
    description: 'Clicker challenge deleted successfully',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.clickerChallengesService.remove(id)
  }

  @Put(':id/condition')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update challenge condition' })
  @ApiResponse({
    status: 200,
    description: 'Challenge condition updated successfully',
  })
  updateCondition(
    @Param('id', ParseIntPipe) id: number,
    @Body() conditionData: UpdateChallengeConditionDto,
  ) {
    return this.clickerChallengesService.updateCondition(id, conditionData)
  }
}
