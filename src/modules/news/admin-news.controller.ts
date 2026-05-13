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
  AdminNewsListQueryDto,
  CreateNewsDto,
  UpdateNewsDto,
} from './dto/admin-news.dto'
import { NewsService } from './news.service'

@ApiTags('admin-news')
@ApiBearerAuth()
@Controller('admin/news')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
export class AdminNewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  @AdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
    AdminRole.MANAGER,
    AdminRole.VIEWER,
  )
  @ApiOperation({ summary: 'List news for the admin panel' })
  @ApiResponse({ status: 200, description: 'Return paginated news' })
  findAll(@Query() query: AdminNewsListQueryDto) {
    return this.newsService.findAllForAdmin(query)
  }

  @Get(':id')
  @AdminRoles(
    AdminRole.SUPER_ADMIN,
    AdminRole.ADMIN,
    AdminRole.MANAGER,
    AdminRole.VIEWER,
  )
  @ApiOperation({ summary: 'Get news by ID for the admin panel' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.newsService.findAdminById(id)
  }

  @Post()
  @AdminMutation({ entity: 'news', action: 'create' })
  @ApiOperation({ summary: 'Create news from the admin panel' })
  create(@Body() dto: CreateNewsDto) {
    return this.newsService.createAdmin(dto)
  }

  @Patch(':id')
  @AdminMutation({ entity: 'news', action: 'update' })
  @ApiOperation({ summary: 'Update news from the admin panel' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNewsDto) {
    return this.newsService.updateAdmin(id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminMutation({ entity: 'news', action: 'delete' })
  @ApiOperation({ summary: 'Delete news from the admin panel' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.newsService.removeAdmin(id)
  }
}
