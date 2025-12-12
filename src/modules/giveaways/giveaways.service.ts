import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Giveaway, GiveawayStatus } from './entities/giveaway.entity'
import { User } from '../users/user.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'

@Injectable()
export class GiveawaysService {
  private readonly logger = new Logger(GiveawaysService.name)

  constructor(
    @InjectRepository(Giveaway)
    private readonly giveawayRepository: Repository<Giveaway>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CsgoSkin)
    private readonly skinRepository: Repository<CsgoSkin>,
  ) {}

  /**
   * Get all giveaways with all information
   */
  async findAll(): Promise<Giveaway[]> {
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
    const giveaways = await this.giveawayRepository.find({
      where: { status: GiveawayStatus.ACTIVE },
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
    const now = new Date()
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
