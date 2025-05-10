import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common'
import { ClickerUserService } from './clicker-user.service'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

@ApiTags('clicker-users')
@Controller('clicker-users')
export class ClickerUserController {
  constructor(private readonly clickerUserService: ClickerUserService) {}

  @Get()
  @ApiOperation({ summary: 'Get all clicker users' })
  findAll() {
    return this.clickerUserService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get clicker user by ID' })
  findOne(@Param('id') id: number) {
    return this.clickerUserService.findById(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a new clicker user' })
  create(@Body() data: any) {
    return this.clickerUserService.create(data)
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a clicker user by ID' })
  update(@Param('id') id: number, @Body() data: any) {
    return this.clickerUserService.update(id, data)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a clicker user by ID' })
  remove(@Param('id') id: number) {
    return this.clickerUserService.remove(id)
  }
}
