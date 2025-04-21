// src/modules/userBonuses/entities/user-bonus.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm'
import { User } from '../users/user.entity'
import { Reward } from '../rewards/entities/rewards.entity'
import { PromoCode } from '../promoCodes/entities/promoCode.entity'

export enum BonusType {
  WHEEL = 'WHEEL',
  PROMO = 'PROMO',
}

@Entity('user_bonuses')
export class UserBonus {
  @PrimaryGeneratedColumn()
  id!: number

  @Index()
  @Column()
  user_id!: number

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Index()
  @Column({
    type: 'enum',
    enum: BonusType,
  })
  bonus_type!: BonusType

  @Column({ nullable: true })
  reward_id!: number

  @ManyToOne(() => Reward)
  @JoinColumn({ name: 'reward_id' })
  reward!: Reward

  @Column({ nullable: true })
  promo_code_id!: number

  @ManyToOne(() => PromoCode)
  @JoinColumn({ name: 'promo_code_id' })
  promoCode!: PromoCode

  @Index()
  @Column({ default: false })
  is_claimed!: boolean

  @Column({ type: 'timestamp with time zone', nullable: true })
  last_claimed_at!: Date

  @Index()
  @Column({ type: 'timestamp with time zone', nullable: true })
  expired_at!: Date

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at!: Date
}
