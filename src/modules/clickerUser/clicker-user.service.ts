import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ClickerUser } from './entities/clicker_user.entity'
import { ClickerLevelsService } from '../clickerLevels/clicker-levels.service'
import { ClickDto } from './dto/click.dto'
import { CreateClickerUserDto } from './dto/create-clicker-user.dto'
import { ClickerClickLevelsService } from '../clickerClickLevels/clicker-click-levels.service'
import { ClickerEnergyLevelsService } from '../clickerEnergyLevels/clicker-energy-levels.service'

@Injectable()
export class ClickerUserService {
  private readonly ENERGY_REGENERATION_TIME = 10 * 60 * 60 * 1000 // 10 hours in milliseconds

  constructor(
    @InjectRepository(ClickerUser)
    private readonly clickerUserRepository: Repository<ClickerUser>,
    private readonly clickerLevelsService: ClickerLevelsService,
    private readonly clickerClickLevelsService: ClickerClickLevelsService,
    private readonly clickerEnergyLevelsService: ClickerEnergyLevelsService,
  ) {}

  findAll() {
    return this.clickerUserRepository.find()
  }

  findById(id: number) {
    return this.clickerUserRepository.findOne({ where: { id } })
  }

  async findByUserId(userId: number) {
    const user = await this.clickerUserRepository.findOne({
      where: { user_id: userId },
      relations: ['level', 'click_level', 'energy_level'],
    })

    if (!user) {
      throw new NotFoundException('Clicker profile not found')
    }

    return user
  }

  async create(createDto: CreateClickerUserDto) {
    const existingUser = await this.clickerUserRepository.findOne({
      where: { user_id: createDto.user_id },
    })

    if (existingUser) {
      throw new ConflictException(
        'Clicker profile already exists for this user',
      )
    }

    const level = await this.clickerLevelsService.findById(createDto.level || 1)
    if (!level) {
      throw new NotFoundException('Initial level not found')
    }
    const clickLevel = await this.clickerClickLevelsService.findById(
      createDto.click_level || 1,
    )
    if (!clickLevel) {
      throw new NotFoundException('Initial click level not found')
    }
    const energyLevel = await this.clickerEnergyLevelsService.findById(
      createDto.energy_level || 1,
    )
    if (!energyLevel) {
      throw new NotFoundException('Initial energy level not found')
    }

    const clickerUser = this.clickerUserRepository.create({
      user_id: createDto.user_id,
      level,
      click_level: clickLevel,
      energy_level: energyLevel,
      energy_amount: createDto.energy_amount || 100,
      points: createDto.points || 0,
    })

    return this.clickerUserRepository.save(clickerUser)
  }

  update(id: number, data: Partial<ClickerUser>) {
    return this.clickerUserRepository.update(id, data)
  }

  remove(id: number) {
    return this.clickerUserRepository.delete(id)
  }

  async getEnergyRegenerationInfo(userId: number) {
    console.log('getEnergyRegenerationInfo', userId)
    const user = await this.clickerUserRepository.findOne({
      where: { user_id: userId },
      relations: ['energy_level'],
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Возвращаем текущее состояние энергии без обновления
    return {
      energy_amount: user.energy_amount,
      max_energy: user.energy_level.energy_amount,
      time_to_regenerate: 0,
      is_regenerating: false,
    }

    /* Закомментированная логика восстановления энергии
    const now = new Date()
    const timeSinceLastUpdate = now.getTime() - user.last_energy_update.getTime()

    // Если энергия уже восстановлена
    if (timeSinceLastUpdate >= this.ENERGY_REGENERATION_TIME) {
      // Обновляем энергию до максимума
      user.energy_amount = user.energy_level.energy_amount
      user.last_energy_update = now
      
      // Сохраняем изменения в базе данных
      const updatedUser = await this.clickerUserRepository.save(user)
      console.log('Energy restored:', updatedUser.energy_amount)

      return {
        energy_amount: updatedUser.energy_amount,
        max_energy: updatedUser.energy_level.energy_amount,
        time_to_regenerate: 0,
        is_regenerating: false,
      }
    }

    // Если энергия еще восстанавливается
    const timeToRegenerate = Math.max(
      0,
      this.ENERGY_REGENERATION_TIME - timeSinceLastUpdate,
    )

    // Рассчитываем частичное восстановление энергии
    const regenerationProgress = timeSinceLastUpdate / this.ENERGY_REGENERATION_TIME
    const regeneratedEnergy = Math.floor(user.energy_level.energy_amount * regenerationProgress)
    
    // Обновляем энергию, если она изменилась
    if (regeneratedEnergy > user.energy_amount) {
      user.energy_amount = regeneratedEnergy
      await this.clickerUserRepository.save(user)
      console.log('Energy partially restored:', user.energy_amount)
    }

    return {
      energy_amount: user.energy_amount,
      max_energy: user.energy_level.energy_amount,
      time_to_regenerate: timeToRegenerate,
      is_regenerating: timeToRegenerate > 0,
    }
    */
  }

  async handleClick(clickDto: ClickDto) {
    const user = await this.clickerUserRepository.findOne({
      where: { user_id: clickDto.user_id },
      relations: ['level', 'click_level', 'energy_level'],
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    let currentLevel = await this.clickerLevelsService.findById(user.level.id)
    if (!currentLevel) {
      throw new NotFoundException('Level not found')
    }

    // Рассчитываем награду за клик
    const totalReward = user.click_level.reward_per_click

    // Проверяем наличие энергии
    if (user.energy_amount <= 0) {
      throw new Error('No energy available')
    }

    // Если энергии меньше чем требуется, используем всю доступную энергию
    if (user.energy_amount < totalReward) {
      user.points += user.energy_amount
      user.energy_amount = 0
      user.last_energy_update = new Date() // Обновляем время последнего изменения энергии
    } else {
      // Если энергии достаточно, используем полную награду
      user.energy_amount -= totalReward
      user.points += totalReward
    }

    // Автоматическое повышение уровня, если хватает поинтов
    while (true) {
      const nextLevel = await this.clickerLevelsService.findById(
        user.level.id + 1,
      )
      if (nextLevel && user.points >= nextLevel.upgrade_cost) {
        user.level = nextLevel
        currentLevel = nextLevel
      } else {
        break
      }
    }

    // Сохраняем изменения
    await this.clickerUserRepository.save(user)

    return {
      points: user.points,
      energy_amount: user.energy_amount,
      reward: totalReward,
      level: user.level,
      click_level: user.click_level,
      energy_level: user.energy_level,
      time_to_regenerate:
        user.energy_amount === 0
          ? this.ENERGY_REGENERATION_TIME -
            (new Date().getTime() - user.last_energy_update.getTime())
          : 0,
    }
  }

  async upgradeClickLevel(userId: number) {
    const user = await this.clickerUserRepository.findOne({
      where: { user_id: userId },
      relations: ['click_level'],
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Получаем текущий уровень клика
    let currentClickLevel = await this.clickerClickLevelsService.findById(
      user.click_level.id,
    )
    if (!currentClickLevel) {
      throw new NotFoundException('Click level not found')
    }

    // Получаем следующий уровень клика
    const nextClickLevel = await this.clickerClickLevelsService.findById(
      user.click_level.id + 1,
    )
    if (!nextClickLevel) {
      throw new NotFoundException('Next click level not found')
    }

    // Проверяем достаточно ли поинтов для улучшения
    if (user.points < nextClickLevel.upgrade_cost) {
      throw new Error('Not enough points for upgrade')
    }

    // Обновляем уровень клика и тратим поинты
    user.click_level = nextClickLevel
    user.points -= nextClickLevel.upgrade_cost

    await this.clickerUserRepository.save(user)

    return {
      click_level: user.click_level,
      points: user.points,
    }
  }

  async upgradeEnergyLevel(userId: number) {
    const user = await this.clickerUserRepository.findOne({
      where: { user_id: userId },
      relations: ['energy_level'],
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    // Получаем текущий уровень энергии
    let currentEnergyLevel = await this.clickerEnergyLevelsService.findById(
      user.energy_level.id,
    )
    if (!currentEnergyLevel) {
      throw new NotFoundException('Energy level not found')
    }

    // Получаем следующий уровень энергии
    const nextEnergyLevel = await this.clickerEnergyLevelsService.findById(
      user.energy_level.id + 1,
    )
    if (!nextEnergyLevel) {
      throw new NotFoundException('Next energy level not found')
    }

    // Проверяем достаточно ли поинтов для улучшения
    if (user.points < nextEnergyLevel.upgrade_cost) {
      throw new Error('Not enough points for upgrade')
    }

    // Обновляем уровень энергии и тратим поинты
    user.energy_level = nextEnergyLevel
    // user.energy_amount += nextEnergyLevel.energy_amount Можно скорректировать логику начисления энергии
    user.points -= nextEnergyLevel.upgrade_cost

    await this.clickerUserRepository.save(user)

    return {
      energy_level: user.energy_level,
      energy_amount: user.energy_amount,
      points: user.points,
    }
  }
}
