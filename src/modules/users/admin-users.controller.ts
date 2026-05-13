import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { AdminMutation } from '../admin/decorators/admin-mutation.decorator'
import { AdminRoles } from '../admin/decorators/admin-roles.decorator'
import { AdminJwtGuard } from '../admin/guards/admin-jwt.guard'
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard'
import { AdminRole } from '../admin/types/admin-role.enum'
import {
  AdminUpdateUserDto,
  AdminUserListQueryDto,
} from './dto/admin-user.dto'
import { UserService } from './users.service'

@ApiTags('admin-users')
@ApiBearerAuth()
@Controller('admin/catalog/users')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminUsersController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({ summary: 'List game users for admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated user list' })
  @AdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
    AdminRole.MANAGER,
    AdminRole.VIEWER,
  )
  @Get()
  findAll(@Query() query: AdminUserListQueryDto) {
    return this.userService.findAllForAdmin(query)
  }

  @ApiOperation({ summary: 'Get user deposit history for admin panel' })
  @ApiResponse({ status: 200, description: 'Return latest user deposits' })
  @AdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
    AdminRole.MANAGER,
    AdminRole.VIEWER,
  )
  @Get(':id/deposits')
  findDeposits(@Param('id', ParseIntPipe) id: number) {
    return this.userService.getDepositHistory(id)
  }

  @ApiOperation({ summary: 'Get game user by ID for admin panel' })
  @ApiResponse({ status: 200, description: 'Return full user profile' })
  @AdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
    AdminRole.MANAGER,
    AdminRole.VIEWER,
  )
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findAdminById(id)
  }

  @ApiOperation({ summary: 'Update game user admin settings' })
  @ApiResponse({ status: 200, description: 'Return updated user profile' })
  @AdminMutation({ entity: 'users', action: 'update' })
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: AdminUpdateUserDto,
  ) {
    return this.userService.updateForAdmin(id, payload)
  }
}
