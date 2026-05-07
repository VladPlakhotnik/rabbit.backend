import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { numericTransformer } from '../../../common/helpers/numericTransformer'
import type { MinesStakeItemSnapshot } from '../../mines/entities/mines-session.entity'
import { User } from '../../users/user.entity'

export type CrashStakeMode = 'balance' | 'inventory'
export type CrashSessionStatus = 'active' | 'cashed_out' | 'crashed'
export type CrashStakeItemSnapshot = MinesStakeItemSnapshot

@Entity('crash_sessions')
@Index('IDX_crash_sessions_user_status', ['user_id', 'status'])
@Index('IDX_crash_sessions_created_at', ['created_at'])
export class CrashSession {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'varchar', length: 16 })
  stake_mode!: CrashStakeMode

  @Column({ type: 'integer', default: 1 })
  slot!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  stake_amount!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  cashout_multiplier!: number | null

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  win_amount!: number | null

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status!: CrashSessionStatus

  @Column({ type: 'varchar', length: 32, default: 'MFR_MATH_RANDOM' })
  mfr_algorithm!: string

  @Column({ type: 'varchar', length: 64 })
  mfr_seed_hash!: string

  @Column({ type: 'jsonb', nullable: true })
  stake_items!: CrashStakeItemSnapshot[] | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date
}
