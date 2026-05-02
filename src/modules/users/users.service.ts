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
    const user = await this.userRepository.findOne({
      where: { id },
    })

    return user || null
  }

  async findBySteamId(steam_id: string | number): Promise<User | null> {
    const steamIdString = steam_id.toString()
    this.logger.log(
      `Searching for user with Steam ID: ${steamIdString} (input type: ${typeof steam_id})`,
    )

    // Use string comparison to avoid precision loss with bigint
    // TypeORM will handle the conversion from string to bigint in the database
    const user = await this.userRepository
      .createQueryBuilder('user')
      .where('CAST(user.steam_id AS TEXT) = :steam_id', {
        steam_id: steamIdString,
      })
      .getOne()

    if (user) {
      this.logger.log(
        `Found user with ID: ${user.id}, Steam ID: ${user.steam_id}`,
      )
    } else {
      this.logger.log(`No user found with Steam ID: ${steamIdString}`)

      // Try alternative search in case of type mismatch
      this.logger.log(`Trying alternative search method...`)
      const altUser = await this.userRepository
        .createQueryBuilder('user')
        .where('user.steam_id = CAST(:steam_id AS BIGINT)', {
          steam_id: steamIdString,
        })
        .getOne()

      if (altUser) {
        this.logger.log(`Found user with alternative search method`)
        return altUser
      }
    }

    return user || null
  }

  async findByTelegramId(telegram_user_id: number): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { telegram_user_id },
    })
    return user || null
  }

  async findByGoogleId(google_id: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { google_id },
    })
    return user || null
  }

  async create(userData: Partial<User>): Promise<User> {
    if (
      !userData.steam_id &&
      !userData.telegram_user_id &&
      !userData.google_id
    ) {
      throw new Error('Either Steam ID, Telegram ID, or Google ID is required')
    }

    // Handle Steam ID as string to avoid precision loss for large numbers
    const processedData = { ...userData }
    if (processedData.steam_id && typeof processedData.steam_id === 'string') {
      const bigIntValue = BigInt(processedData.steam_id)
      if (bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER)) {
        // Safe to convert to number
        processedData.steam_id = Number(bigIntValue)
      } else {
        // For very large Steam IDs, use raw SQL to preserve precision
        this.logger.log(
          `Creating user with large Steam ID (preserving precision): ${processedData.steam_id}`,
        )
        const steamIdString = processedData.steam_id
        const userDataCopy = { ...processedData }
        delete userDataCopy.steam_id

        // Create user without steam_id first, then update it via raw SQL
        const newUser = this.userRepository.create(userDataCopy)
        const savedUser = await this.userRepository.save(newUser)

        // Update steam_id using raw SQL to preserve precision
        await this.userRepository.manager.query(
          `UPDATE users SET steam_id = CAST($1 AS BIGINT) WHERE id = $2`,
          [steamIdString, savedUser.id],
        )

        // Return updated user
        const updatedUser = await this.userRepository.findOne({
          where: { id: savedUser.id },
        })
        if (!updatedUser) {
          throw new Error('Failed to create user')
        }
        return updatedUser
      }
    }

    const newUser = this.userRepository.create(processedData)
    return this.userRepository.save(newUser)
  }

  async updateTradeLink(userId: number, tradeLink: string): Promise<void> {
    await this.userRepository.update(userId, { trade_link: tradeLink })
  }

  async linkTelegramAccount(
    userId: number,
    telegramUserId: number,
  ): Promise<User> {
    // Check if telegram account is already linked to another user
    const existingUser = await this.userRepository.findOne({
      where: { telegram_user_id: telegramUserId },
    })

    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException(
        'This Telegram account is already linked to another user',
      )
    }

    // Update user's telegram_user_id
    await this.userRepository.update(userId, {
      telegram_user_id: telegramUserId,
    })

    const updatedUser = await this.findById(userId)
    if (!updatedUser) {
      throw new NotFoundException('User not found')
    }

    return updatedUser
  }

  /**
   * Updates only Steam ID without changing other user data
   */
  async updateSteamIdOnly(
    userId: number,
    steamId: string | number,
  ): Promise<User> {
    const steamIdString = steamId.toString()
    this.logger.log(
      `Updating Steam ID ${steamIdString} for user ${userId} (without changing other data)`,
    )

    // Handle large Steam IDs (preserve precision)
    const bigIntValue = BigInt(steamIdString)

    if (bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER)) {
      await this.userRepository.update(userId, {
        steam_id: Number(bigIntValue),
      })
    } else {
      // For very large Steam IDs, use raw SQL to preserve precision
      await this.userRepository.manager.query(
        `UPDATE users SET steam_id = CAST($1 AS BIGINT) WHERE id = $2`,
        [steamIdString, userId],
      )
    }

    const updatedUser = await this.findById(userId)
    if (!updatedUser) {
      throw new NotFoundException('User not found')
    }

    return updatedUser
  }

  /**
   * Attaches a verified Telegram id to an existing user account.
   *
   * Pre-validation: explicit lookup of the telegram_id in `users` first,
   * so we can fail with a friendly "already linked to another account"
   * rather than relying on the DB UNIQUE-violation surface (which would
   * otherwise become a generic 500). The UNIQUE index on
   * users.telegram_user_id is the last line of defence — if a request
   * still races past this check, the DB rejects it; we catch the driver
   * error code 23505 and surface the same 400.
   */
  async updateTelegramIdOnly(
    userId: number,
    telegramUserId: number,
  ): Promise<User> {
    this.logger.log(
      `Linking Telegram ID ${telegramUserId} to user ${userId}`,
    )

    const existing = await this.findByTelegramId(telegramUserId)
    if (existing && existing.id !== userId) {
      throw new BadRequestException(
        'This Telegram account is already linked to another user',
      )
    }

    try {
      await this.userRepository.update(userId, {
        telegram_user_id: telegramUserId,
      })
    } catch (err: unknown) {
      // Postgres unique_violation. Catch here so a parallel link from a
      // different user that won the race doesn't leak a 500.
      if (
        typeof err === 'object' &&
        err !== null &&
        (err as { code?: string }).code === '23505'
      ) {
        throw new BadRequestException(
          'This Telegram account is already linked to another user',
        )
      }
      throw err
    }

    const updatedUser = await this.findById(userId)
    if (!updatedUser) {
      throw new NotFoundException('User not found')
    }

    return updatedUser
  }

  async linkSteamAccount(
    userId: number,
    steamId: string | number,
    displayName?: string,
    avatar?: string,
    profileUrl?: string,
  ): Promise<User> {
    const steamIdString = steamId.toString()
    this.logger.log(`Linking Steam account ${steamIdString} to user ${userId}`)

    // Check if steam account is already linked to another user using string comparison
    const existingUser = await this.findBySteamId(steamIdString)

    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException(
        'This Steam account is already linked to another user',
      )
    }

    // Handle large Steam IDs (preserve precision)
    const bigIntValue = BigInt(steamIdString)
    let steamIdNumber: number | string

    if (bigIntValue <= BigInt(Number.MAX_SAFE_INTEGER)) {
      steamIdNumber = Number(bigIntValue)
    } else {
      // For very large Steam IDs, use raw SQL to preserve precision
      this.logger.log(
        `Linking large Steam ID (preserving precision): ${steamIdString}`,
      )

      // First update other fields if provided
      const updateData: Partial<User> = {}
      if (displayName) {
        updateData.display_name = displayName
      }
      if (avatar) {
        updateData.avatar = avatar
      }
      if (profileUrl) {
        updateData.profile_url = profileUrl
      }

      if (Object.keys(updateData).length > 0) {
        await this.userRepository.update(userId, updateData)
      }

      // Update steam_id using raw SQL to preserve precision
      await this.userRepository.manager.query(
        `UPDATE users SET steam_id = CAST($1 AS BIGINT) WHERE id = $2`,
        [steamIdString, userId],
      )

      const updatedUser = await this.findById(userId)
      if (!updatedUser) {
        throw new NotFoundException('User not found')
      }

      return updatedUser
    }

    // Update user's steam_id and related fields
    const updateData: Partial<User> = {
      steam_id: steamIdNumber,
    }

    if (displayName) {
      updateData.display_name = displayName
    }
    if (avatar) {
      updateData.avatar = avatar
    }
    if (profileUrl) {
      updateData.profile_url = profileUrl
    }

    await this.userRepository.update(userId, updateData)

    const updatedUser = await this.findById(userId)
    if (!updatedUser) {
      throw new NotFoundException('User not found')
    }

    return updatedUser
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

  /**
   * Claim Telegram subscription bonus
   * @param userId - User ID
   * @param bonusAmount - Bonus amount to add
   * @returns Updated user with new balance
   */
  async claimTelegramSubscriptionBonus(
    userId: number,
    bonusAmount: number,
  ): Promise<User> {
    return this.userRepository.manager.transaction(async manager => {
      const user = await manager.findOne(User, { where: { id: userId } })

      if (!user) {
        throw new NotFoundException('User not found')
      }

      if (user.telegram_bonus_claimed) {
        throw new BadRequestException(
          'Telegram subscription bonus has already been claimed',
        )
      }

      user.balance += bonusAmount
      user.telegram_bonus_claimed = true
      await manager.save(user)

      this.logger.log(
        `Telegram subscription bonus claimed for user ${userId}: ${bonusAmount}`,
      )

      return user
    })
  }
}
