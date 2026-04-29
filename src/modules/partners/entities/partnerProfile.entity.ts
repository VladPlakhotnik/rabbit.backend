import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm'
import { User } from '../../users/user.entity'
import { numericTransformer } from '../../../common/helpers/numericTransformer'

export enum PartnerLevel {
  BRONZE = 1,
  SILVER = 2,
  GOLD = 3,
  PLATINUM = 4,
  DIAMOND = 5,
}

@Entity('partner_profiles')
export class PartnerProfile {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'int', unique: true })
  user_id!: number

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'smallint', default: PartnerLevel.BRONZE })
  level!: PartnerLevel

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  referral_balance!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  total_earned!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  total_referrals_deposit!: number

  @Column({ type: 'timestamp', nullable: true })
  last_code_change_at!: Date | null

  @Column({ type: 'boolean', default: false })
  code_locked_by_admin!: boolean

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
