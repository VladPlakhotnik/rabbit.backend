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
import { User } from '../../users/user.entity'

export type CrashAutoBetRoundAction =
  | 'reset_to_initial'
  | 'keep_current'
  | 'increase_50'
  | 'double'
  | 'stop_strategy'

@Entity('crash_auto_bets')
@Index('IDX_crash_auto_bets_user_created_at', ['user_id', 'created_at'])
export class CrashAutoBet {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'varchar', length: 80 })
  name!: string

  @Column({ type: 'boolean', default: true })
  enabled!: boolean

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  auto_cashout_multiplier!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  initial_bet!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  max_bet!: number

  @Column({ type: 'varchar', length: 40, default: 'reset_to_initial' })
  on_win_action!: CrashAutoBetRoundAction

  @Column({ type: 'varchar', length: 40, default: 'keep_current' })
  on_loss_action!: CrashAutoBetRoundAction

  @Column({ type: 'varchar', length: 40, default: 'reset_to_initial' })
  on_max_bet_action!: CrashAutoBetRoundAction

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date
}
