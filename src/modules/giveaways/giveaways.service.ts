import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThanOrEqual, MoreThan, Repository } from 'typeorm'
import { Giveaway, GiveawayStatus } from './entities/giveaway.entity'
import { User } from '../users/user.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { NotificationService } from '../notifications/notification.service'
import { pickGiveawayWinnerId } from './giveaways.logic'
import { CsgoSkin } from '../skins/csgo-skin.entity'

interface FinalizedGiveawayAward {
  giveawayId: number
  giveawayName: string
  skinName: string
  winnerUserId: number
}

@Injectable()
export class GiveawaysService {
  private readonly logger = new Logger(GiveawaysService.name)

  constructor(
    @InjectRepository(Giveaway)
    private readonly giveawayRepository: Repository<Giveaway>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserInventory)
    private readonly userInventoryRepository: Repository<UserInventory>,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Get all giveaways with all information
   */
  async findAll(): Promise<Giveaway[]> {
    await this.finalizeExpiredGiveaways()

    const giveaways = await this.giveawayRepository.find({
      relations: ['skin', 'winner'],
      order: {
        created_at: 'DESC',
      },
    })

    return this.mapGiveawaysWithLimitedWinner(giveaways)
  }

  /**
   * Get all upcoming giveaways
   */
  async findAllActive(): Promise<Giveaway[]> {
    const now = new Date()
    await this.finalizeExpiredGiveaways(now)

    const giveaways = await this.giveawayRepository.find({
      where: {
        status: GiveawayStatus.ACTIVE,
        start_time: LessThanOrEqual(now),
        end_time: MoreThan(now),
      },
      relations: ['skin', 'winner'],
      order: {
        end_time: 'DESC',
      },
    })

    return this.mapGiveawaysWithLimitedWinner(giveaways)
  }

  /**
   * Get all completed giveaways with winners
   */
  async findAllWinners(): Promise<Giveaway[]> {
    await this.finalizeExpiredGiveaways()

    const giveaways = await this.giveawayRepository
      .createQueryBuilder('giveaway')
      .leftJoinAndSelect('giveaway.skin', 'skin')
      .leftJoinAndSelect('giveaway.winner', 'winner')
      .where('giveaway.status = :status', { status: GiveawayStatus.COMPLETED })
      .andWhere('giveaway.winner_user_id IS NOT NULL')
      .orderBy('giveaway.end_time', 'DESC')
      .getMany()

    return this.mapGiveawaysWithLimitedWinner(giveaways)
  }

  /**
   * Participate in a giveaway
   */
  async participate(giveawayId: number, userId: number): Promise<Giveaway> {
    const now = new Date()
    await this.finalizeExpiredGiveaways(now)

    // Find the giveaway
    const giveaway = await this.giveawayRepository.findOne({
      where: { id: giveawayId },
      relations: ['skin'],
    })

    if (!giveaway) {
      throw new NotFoundException('Giveaway not found')
    }

    // Check if giveaway is active
    if (giveaway.status !== GiveawayStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot participate in giveaway with status: ${giveaway.status}`,
      )
    }

    // Check if current time is within giveaway period
    if (now < giveaway.start_time) {
      throw new BadRequestException('Giveaway has not started yet')
    }

    if (now > giveaway.end_time) {
      throw new BadRequestException('Giveaway has already ended')
    }

    // Check if user is already a participant
    if (giveaway.participants.includes(userId)) {
      throw new BadRequestException(
        'User is already participating in this giveaway',
      )
    }

    // Check user's deposit amount
    const user = await this.userRepository.findOne({
      where: { id: userId },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (user.deposit_amount < giveaway.required_deposit_amount) {
      throw new BadRequestException(
        `User deposit amount (${user.deposit_amount}) is less than required (${giveaway.required_deposit_amount})`,
      )
    }

    // Add user to participants
    giveaway.participants = [...giveaway.participants, userId]
    giveaway.participant_count = giveaway.participants.length

    await this.giveawayRepository.save(giveaway)

    this.logger.log(
      `User ${userId} joined giveaway ${giveawayId}. Total participants: ${giveaway.participant_count}`,
    )

    const giveawayWithWinner = await this.giveawayRepository.findOne({
      where: { id: giveawayId },
      relations: ['skin', 'winner'],
    })

    if (!giveawayWithWinner) {
      throw new NotFoundException('Giveaway not found')
    }

    return this.mapGiveawayWithLimitedWinner(giveawayWithWinner)
  }

  @Cron('*/30 * * * * *')
  async finalizeExpiredGiveawaysJob(): Promise<void> {
    try {
      await this.finalizeExpiredGiveaways()
    } catch (error) {
      this.logger.error(
        `Failed to finalize expired giveaways: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  async finalizeExpiredGiveaways(
    now = new Date(),
  ): Promise<FinalizedGiveawayAward[]> {
    const hasExpiredGiveaways = await this.giveawayRepository.exists({
      where: {
        status: GiveawayStatus.ACTIVE,
        end_time: LessThanOrEqual(now),
      },
    })

    if (!hasExpiredGiveaways) {
      return []
    }

    const awards = await this.giveawayRepository.manager.transaction(
      async manager => {
        const expiredGiveaways = await manager
          .createQueryBuilder(Giveaway, 'giveaway')
          .where('giveaway.status = :status', {
            status: GiveawayStatus.ACTIVE,
          })
          .andWhere('giveaway.end_time <= :now', { now })
          .setLock('pessimistic_write')
          .getMany()

        const finalizedAwards: FinalizedGiveawayAward[] = []

        for (const giveaway of expiredGiveaways) {
          const participantIds = Array.from(new Set(giveaway.participants ?? []))
          giveaway.participants = participantIds
          giveaway.participant_count = participantIds.length

          const winnerUserId = pickGiveawayWinnerId(participantIds)

          if (!winnerUserId) {
            giveaway.status = GiveawayStatus.CANCELLED
            giveaway.winner_user_id = null
            await manager.save(Giveaway, giveaway)
            this.logger.log(
              `Giveaway ${giveaway.id} cancelled: no participants`,
            )
            continue
          }

          giveaway.status = GiveawayStatus.COMPLETED
          giveaway.winner_user_id = winnerUserId
          await manager.save(Giveaway, giveaway)

          const inventoryItem = this.userInventoryRepository.create({
            user: { id: winnerUserId } as User,
            game_type: 'csgo',
            csgo_skin_id: giveaway.skin_id,
            dota_skin_id: null,
            obtained_at: now,
            is_sold: false,
            is_withdrawn: false,
            withdrawn_at: null,
          })

          await manager.save(UserInventory, inventoryItem)

          const skin = await manager.findOne(CsgoSkin, {
            where: { id: giveaway.skin_id },
          })

          finalizedAwards.push({
            giveawayId: giveaway.id,
            giveawayName: giveaway.name,
            skinName: skin?.name ?? giveaway.name,
            winnerUserId,
          })
        }

        return finalizedAwards
      },
    )

    await Promise.all(
      awards.map(async award => {
        try {
          await this.notificationService.notifyGiveawayWon(
            award.winnerUserId,
            award.giveawayName,
            award.skinName,
          )
        } catch (error) {
          this.logger.warn(
            `Giveaway ${award.giveawayId} was finalized, but winner notification failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
      }),
    )

    if (awards.length > 0) {
      this.logger.log(`Finalized ${awards.length} expired giveaways`)
    }

    return awards
  }

  /**
   * Get giveaway by ID
   */
  async findById(id: number): Promise<Giveaway> {
    const giveaway = await this.giveawayRepository.findOne({
      where: { id },
      relations: ['skin', 'winner'],
    })

    if (!giveaway) {
      throw new NotFoundException('Giveaway not found')
    }

    return this.mapGiveawayWithLimitedWinner(giveaway)
  }

  /**
   * Map giveaway with limited winner fields (only id, display_name, avatar)
   */
  private mapGiveawayWithLimitedWinner(giveaway: Giveaway): Giveaway {
    if (giveaway.winner) {
      giveaway.winner = {
        id: giveaway.winner.id,
        display_name: giveaway.winner.display_name,
        avatar: giveaway.winner.avatar,
      } as User
    }
    return giveaway
  }

  /**
   * Map multiple giveaways with limited winner fields
   */
  private mapGiveawaysWithLimitedWinner(giveaways: Giveaway[]): Giveaway[] {
    return giveaways.map(giveaway =>
      this.mapGiveawayWithLimitedWinner(giveaway),
    )
  }
}
