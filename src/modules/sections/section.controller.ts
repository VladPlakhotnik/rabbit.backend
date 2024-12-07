import { Controller, Get, Param, Post, Body, Query, Req } from '@nestjs/common'
import { SectionService } from './section.service'
import { Request } from 'express'

@Controller('sections')
export class SectionController {
  constructor(private readonly sectionService: SectionService) {}

  @Get()
  async getSections(
    @Req() req: Request,
    @Query('name') name?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('enoughBalance') enoughBalance?: string,
  ) {
    const user = req.user // Приведение типа, замените на ваш тип пользователя
    const userBalance = user ? user.balance : undefined // Предполагаем, что баланс хранится в user.balance

    const applyEnoughBalance =
      enoughBalance === 'true' && userBalance !== undefined

    return this.sectionService.findAll({
      name,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      applyEnoughBalance,
      userBalance, // Передаём баланс пользователя вместо параметра из запроса
    })
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    return this.sectionService.findById(id)
  }

  @Post()
  async create(@Body('name') name: string) {
    return this.sectionService.create(name)
  }
}
