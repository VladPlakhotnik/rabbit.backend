import { Controller, Get, Param, NotFoundException } from '@nestjs/common'
import { UserService } from './users.service'

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  async findAll() {
    const users = await this.userService.findAll()
    return users
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    const user = await this.userService.findById(id)
    if (!user) {
      throw new NotFoundException('User not found')
    }

    const { balance, ...userWithoutBalance } = user
    return userWithoutBalance
  }
}
