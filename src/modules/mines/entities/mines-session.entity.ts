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
import type { GameType } from '../../userInventory/userInventory.entity'

export type MinesStakeMode = 'balance' | 'inventory'
export type MinesSessionStatus = 'active' | 'cashed_out' | 'lost'

export interface MinesStakeItemSnapshot {
  inventory_id: number
  skin_id: number
  game_type: GameType
  name: string
  image: string | null
  rarity: string | null
  price: number
}

@Entity('mines_sessions')
@Index('IDX_mines_sessions_user_status', ['user_id', 'status'])
@Index('IDX_mines_sessions_created_at', ['created_at'])
export class MinesSession {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'varchar', length: 16 })
  stake_mode!: MinesStakeMode

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  bet_amount!: number

  @Column({ type: 'integer' })
  mines_count!: number

  @Column({ type: 'integer', default: 25 })
  board_size!: number

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  mine_positions!: number[]

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  revealed_cells!: number[]

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 1,
    transformer: numericTransformer,
  })
  current_multiplier!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  win_amount!: number | null

  @Column({ type: 'varchar', length: 24, default: 'active' })
  status!: MinesSessionStatus

  @Column({ type: 'varchar', length: 32, default: 'MFR_CRYPTO_RANDOM_INT' })
  mfr_algorithm!: string

  @Column({ type: 'varchar', length: 64 })
  mfr_seed_hash!: string

  @Column({ type: 'jsonb', nullable: true })
  stake_items!: MinesStakeItemSnapshot[] | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date
}
