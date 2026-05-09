import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

import { numericTransformer } from '../../common/helpers/numericTransformer'
import { User } from '../users/user.entity'
import type { EarnVaultPlanId } from './earn-vault.logic'

export type EarnVaultPositionStatus = 'active' | 'claimed' | 'cancelled'

@Entity('earn_vault_positions')
export class EarnVaultPosition {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string

  @Column({ name: 'user_id', type: 'int' })
  user_id!: number

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ name: 'plan_id', type: 'varchar', length: 40 })
  plan_id!: EarnVaultPlanId

  @Column({ name: 'plan_name', type: 'varchar', length: 80 })
  plan_name!: string

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'active' })
  status!: EarnVaultPositionStatus

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number

  @Column({
    name: 'reward_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  reward_amount!: number

  @Column({
    name: 'rate_percent',
    type: 'numeric',
    precision: 6,
    scale: 2,
    transformer: numericTransformer,
  })
  rate_percent!: number

  @Column({ name: 'duration_days', type: 'int' })
  duration_days!: number

  @Column({ name: 'starts_at', type: 'timestamp' })
  starts_at!: Date

  @Column({ name: 'ends_at', type: 'timestamp' })
  ends_at!: Date

  @Column({ name: 'claimed_at', type: 'timestamp', nullable: true })
  claimed_at!: Date | null

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelled_at!: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updated_at!: Date
}
