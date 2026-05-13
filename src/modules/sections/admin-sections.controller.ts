import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { SectionService } from './section.service'
import { CreateSectionDto, UpdateSectionDto } from './dto/section-admin.dto'

@ApiTags('admin-sections')
@ApiBearerAuth()
@Controller('admin/catalog/sections')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminSectionsController {
  constructor(private readonly sectionService: SectionService) {}

  @Get()
  @AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.MANAGER)
  @ApiOperation({ summary: 'List all sections for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return all sections with cases' })
  findAll() {
    return this.sectionService.findAllForAdmin()
  }

  @Post()
  @AdminMutation({ entity: 'sections', action: 'create' })
  @ApiOperation({ summary: 'Create a section from the admin panel' })
  create(@Body() dto: CreateSectionDto) {
    return this.sectionService.createAdmin(dto)
  }

  @Patch(':id')
  @AdminMutation({ entity: 'sections', action: 'update' })
  @ApiOperation({ summary: 'Update a section from the admin panel' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.sectionService.updateAdmin(id, dto)
  }
}
