import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from './user.entity'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'

/**
 * Service for working with users
 * @class UserService
 */

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name)

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly httpService: HttpService,
  ) {}

  findAll() {
    return this.userRepository.find()
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    })
  }

  async findBySteamId(steam_id: number): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { steam_id },
    })
    return user || null
  }

  async create(userData: Partial<User>): Promise<User> {
    if (!userData.steam_id) {
      throw new Error('Steam ID is required')
    }
    const newUser = this.userRepository.create(userData)
    return this.userRepository.save(newUser)
  }

  async updateTradeLink(userId: number, tradeLink: string): Promise<void> {
    await this.userRepository.update(userId, { trade_link: tradeLink })
  }

  async updateBalance(userId: number, amount: number): Promise<void> {
    await this.userRepository.update(userId, { balance: amount })
  }

  async incrementOpenedCases(userId: number): Promise<void> {
    await this.userRepository.increment({ id: userId }, 'opened_cases', 1)
  }

  async updateSteamDisplayName(userId: number): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      if (!user.steam_id) {
        throw new BadRequestException('Steam ID not found')
      }

      const steamProfile = await this.getSteamProfile(user.steam_id.toString())

      user.display_name = steamProfile.personaname
      await this.userRepository.save(user)

      return user
    } catch (error: unknown) {
      this.logger.error(
        `Error updating Steam display name for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
  }

  async updateSteamAvatar(userId: number): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      if (!user.steam_id) {
        throw new BadRequestException('Steam ID not found')
      }

      const steamProfile = await this.getSteamProfile(user.steam_id.toString())

      user.avatar = steamProfile.avatar
      await this.userRepository.save(user)

      return user
    } catch (error: unknown) {
      this.logger.error(
        `Error updating Steam avatar for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
      throw error
    }
  }

  private async getSteamProfile(steamId: string) {
    const response = await firstValueFrom(
      this.httpService.get(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${process.env.STEAM_API_KEY}&steamids=${steamId}`,
      ),
    )

    if (!response.data.response.players[0]) {
      throw new NotFoundException('Steam profile not found')
    }

    return response.data.response.players[0]
  }

  async validateAndDeductBalance(
    userId: number,
    amount: number,
  ): Promise<void> {
    return this.userRepository.manager.transaction(async manager => {
      const user = await manager.findOne(User, { where: { id: userId } })
      if (!user) {
        throw new NotFoundException('User not found')
      }
      if (user.balance < amount) {
        throw new BadRequestException('Insufficient balance')
      }
      user.balance -= amount
      await manager.save(user)
    })
  }
}
