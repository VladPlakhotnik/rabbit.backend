import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { CurrentAdmin } from '../decorators/current-admin.decorator'
import { AdminMutation } from '../decorators/admin-mutation.decorator'
import { AdminRoles } from '../decorators/admin-roles.decorator'
import { RegisterAdminDto } from '../dto/register.dto'
import { UpdateAdminDto } from '../dto/update-admin.dto'
import { Admin } from '../entities/admin.entity'
import { AdminJwtGuard } from '../guards/admin-jwt.guard'
import { AdminRolesGuard } from '../guards/admin-roles.guard'
import { AdminService } from '../services/admin.service'
import { AdminRole } from '../types/admin-role.enum'

@Controller('admin')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminController {
  constructor(private readonly admins: AdminService) {}

  // Create a new staff member. Only super_admin can do this — there
  // is no public registration endpoint by design.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @AdminMutation({ entity: 'admins', action: 'create' }, [AdminRole.SUPER_ADMIN])
  create(@Body() dto: RegisterAdminDto, @CurrentAdmin() requester: Admin) {
    return this.admins.create(dto, requester.id)
  }

  // List all admins. super_admin sees full list, anyone authenticated
  // could in principle but that leaks staff structure — keep it tight.
  @Get()
  @AdminRoles(AdminRole.SUPER_ADMIN)
  findAll() {
    return this.admins.findAll()
  }

  @Get(':id')
  @AdminRoles(AdminRole.SUPER_ADMIN)
  findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.admins.findById(id)
  }

  @Patch(':id')
  @AdminMutation({ entity: 'admins', action: 'update' }, [AdminRole.SUPER_ADMIN])
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAdminDto,
    @CurrentAdmin() requester: Admin,
  ) {
    return this.admins.update(id, dto, requester)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminMutation({ entity: 'admins', action: 'delete' }, [AdminRole.SUPER_ADMIN])
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAdmin() requester: Admin,
  ): Promise<void> {
    await this.admins.remove(id, requester)
  }
}
