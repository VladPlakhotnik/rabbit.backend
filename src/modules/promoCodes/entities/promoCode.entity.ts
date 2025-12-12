import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm'
import { User } from '../../users/user.entity'
import { PromoCodeReward } from './promoCodeReward.entity'

export enum PromoCodeType {
  REFERRAL = 'REFERRAL',
  BONUS = 'BONUS',
}

export enum PromoCodeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  EXPIRED = 'EXPIRED',
}

@Entity('promo_codes')
export class PromoCode {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string

  @Column({ type: 'enum', enum: PromoCodeType })
  type!: PromoCodeType

  @Column({
    type: 'enum',
    enum: PromoCodeStatus,
    default: PromoCodeStatus.ACTIVE,
  })
  status!: PromoCodeStatus

  @CreateDateColumn()
  created_at!: Date

  @Column({ type: 'timestamp', nullable: true })
  expires_at!: Date | null

  @Column({ type: 'integer', nullable: true })
  max_uses!: number | null

  @Column({ type: 'integer', default: 0 })
  current_uses!: number

  @Column({ type: 'text', nullable: true })
  description!: string

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  created_by!: User | null

  @OneToMany(() => PromoCodeReward, reward => reward.promo_code)
  rewards!: PromoCodeReward[]
}
