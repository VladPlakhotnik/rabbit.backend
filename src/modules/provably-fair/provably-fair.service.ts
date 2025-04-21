import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProvablyFair } from './provably-fair.entity'
import * as crypto from 'crypto'
import { GameType } from './enums/game-type.enum'

@Injectable()
export class ProvablyFairService {
  constructor(
    @InjectRepository(ProvablyFair)
    private provablyFairRepository: Repository<ProvablyFair>,
  ) {}

  async generateSeed(
    userId: number,
    clientSeed: string,
    gameType: GameType,
    gameData?: Record<string, any>,
  ) {
    if (!clientSeed || clientSeed.length < 32) {
      throw new BadRequestException('Invalid client seed')
    }

    const serverSeed = crypto.randomBytes(32).toString('hex')
    const publicHash = crypto
      .createHash('sha256')
      .update(serverSeed)
      .digest('hex')

    const game = await this.provablyFairRepository.save({
      user: { id: userId },
      game_type: gameType,
      game_data: gameData,
      client_seed: clientSeed,
      server_seed: serverSeed,
      public_hash: publicHash,
    })

    return {
      game_id: game.id,
      public_hash: publicHash,
    }
  }

  async verifyResult(gameId: number, clientSeed: string, serverSeed: string) {
    const game = await this.provablyFairRepository.findOne({
      where: { id: gameId },
    })

    if (!game) {
      throw new NotFoundException('Game not found')
    }

    if (clientSeed !== game.client_seed) {
      throw new BadRequestException('Invalid client seed')
    }

    if (serverSeed !== game.server_seed) {
      throw new BadRequestException('Invalid server seed')
    }

    const hash = crypto.createHash('sha256').update(serverSeed).digest('hex')
    if (hash !== game.public_hash) {
      throw new BadRequestException('Hash verification failed')
    }

    const resultHash = crypto
      .createHash('sha256')
      .update(clientSeed + serverSeed)
      .digest('hex')

    const randomNumber = parseInt(resultHash.substring(0, 8), 16) / 0xffffffff

    return {
      game_id: gameId,
      random_number: randomNumber,
      verification: {
        client_seed: clientSeed,
        server_seed: serverSeed,
        public_hash: game.public_hash,
      },
    }
  }

  async getLastUnusedSeed(userId: number, gameType: GameType) {
    return this.provablyFairRepository.findOne({
      where: {
        user: { id: userId },
        game_type: gameType,
        is_used: false,
      },
      order: { created_at: 'DESC' },
    })
  }

  async markSeedAsUsed(gameId: number) {
    await this.provablyFairRepository.update(gameId, { is_used: true })
  }

  async getUserGames(userId: number, gameType?: GameType) {
    const where: any = { user: { id: userId } }
    if (gameType) {
      where.game_type = gameType
    }
    return this.provablyFairRepository.find({
      where,
      order: { created_at: 'DESC' },
    })
  }

  async getGameDetails(userId: number, gameId: number) {
    const game = await this.provablyFairRepository.findOne({
      where: { id: gameId, user: { id: userId } },
    })
    if (!game) {
      throw new NotFoundException('Game not found')
    }
    return game
  }

  generateRandomNumber(clientSeed: string, serverSeed: string): number {
    const resultHash = crypto
      .createHash('sha256')
      .update(clientSeed + serverSeed)
      .digest('hex')
    return parseInt(resultHash.substring(0, 8), 16) / 0xffffffff
  }

  // RANGE 0 - 100000

  // generateRandomNumber(clientSeed: string, serverSeed: string): number {
  //   const resultHash = crypto
  //     .createHash('sha256')
  //     .update(clientSeed + serverSeed)
  //     .digest('hex')

  //   // Берем первые 5 байт (10 hex символов) для получения числа от 0 до 100000
  //   const hexValue = resultHash.substring(0, 10)
  //   const number = parseInt(hexValue, 16)

  //   // Нормализуем до диапазона 0-100000
  //   return number % 100001
  // }
}
