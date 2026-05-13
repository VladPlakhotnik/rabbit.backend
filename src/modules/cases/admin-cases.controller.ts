import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { AdminMutation } from '../admin/decorators/admin-mutation.decorator'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRole } from '../admin/types/admin-role.enum'
import {
  AdminCaseListQueryDto,
  CreateCaseDto,
  CreateCaseSkinDto,
  UpdateCaseDto,
  UpdateCaseSkinDto,
} from './dto/case-admin.dto'
import { CaseService } from './case.service'

@ApiTags('admin-cases')
@ApiBearerAuth()
@Controller('admin/cases')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminCasesController {
  constructor(private readonly caseService: CaseService) {}

  @Get()
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.MANAGER)
  @ApiOperation({ summary: 'List all cases for the admin panel' })
  @ApiResponse({
    status: 200,
    description: 'Return all cases, including disabled',
  })
  findAll(@Query() query: AdminCaseListQueryDto) {
    return this.caseService.findAllForAdmin(query)
  }

  @Get(':id')
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.MANAGER)
  @ApiOperation({ summary: 'Get a case by id for the admin panel' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.caseService.findAdminById(id)
  }

  @Post()
  @AdminMutation({ entity: 'cases', action: 'create' })
  @ApiOperation({ summary: 'Create a new case from the admin panel' })
  create(@Body() dto: CreateCaseDto) {
    return this.caseService.createAdmin(dto)
  }

  @Patch(':id')
  @AdminMutation({ entity: 'cases', action: 'update' })
  @ApiOperation({ summary: 'Update a case from the admin panel' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCaseDto) {
    return this.caseService.updateAdmin(id, dto)
  }

  @Post(':id/skins')
  @AdminMutation({ entity: 'case_skins', action: 'create' })
  @ApiOperation({ summary: 'Attach a skin to a case from the admin panel' })
  addSkin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCaseSkinDto,
  ) {
    return this.caseService.addSkinToCase(id, dto)
  }

  @Patch(':id/skins/:skinCaseId')
  @AdminMutation({ entity: 'case_skins', action: 'update' })
  @ApiOperation({ summary: 'Update a case skin chance/drop flag' })
  updateSkin(
    @Param('id', ParseIntPipe) id: number,
    @Param('skinCaseId', ParseIntPipe) skinCaseId: number,
    @Body() dto: UpdateCaseSkinDto,
  ) {
    return this.caseService.updateCaseSkin(id, skinCaseId, dto)
  }

  @Delete(':id/skins/:skinCaseId')
  @AdminMutation({ entity: 'case_skins', action: 'delete' })
  @ApiOperation({ summary: 'Detach a skin from a case' })
  removeSkin(
    @Param('id', ParseIntPipe) id: number,
    @Param('skinCaseId', ParseIntPipe) skinCaseId: number,
  ) {
    return this.caseService.removeCaseSkin(id, skinCaseId)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminMutation({ entity: 'cases', action: 'delete' }, [AdminRole.SUPER_ADMIN])
  @ApiOperation({ summary: 'Delete a case from the admin panel' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.caseService.removeAdmin(id)
  }
}
