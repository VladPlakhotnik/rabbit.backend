import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'

import { numericTransformer } from '../../common/helpers/numericTransformer'
import { User } from '../users/user.entity'

export type VipRewardClaimType = 'cashback' | 'weekly_keys' | 'vip_case_open'

@Entity('vip_reward_claims')
export class VipRewardClaim {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string

  @Column({ name: 'user_id', type: 'int' })
  user_id!: number

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ name: 'reward_type', type: 'varchar', length: 40 })
  reward_type!: VipRewardClaimType

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  amount!: number

  @Column({ name: 'key_delta', type: 'int', default: 0 })
  key_delta!: number

  @Column({ name: 'period_start', type: 'timestamp' })
  period_start!: Date

  @Column({ name: 'period_end', type: 'timestamp' })
  period_end!: Date

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at!: Date
}
