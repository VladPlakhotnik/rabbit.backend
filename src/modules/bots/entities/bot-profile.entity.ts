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
import type {
  BotArchetype,
  BotFavoriteGame,
  BotWealthTier,
} from '../bot-behavior.logic'

@Entity('bot_profiles')
@Index('IDX_bot_profiles_user_id', ['user_id'], { unique: true })
export class BotProfile {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'varchar', length: 16 })
  wealth_tier!: BotWealthTier

  @Column({ type: 'varchar', length: 24 })
  archetype!: BotArchetype

  @Column({ type: 'varchar', length: 16, default: 'mixed' })
  favorite_game!: BotFavoriteGame

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  virtual_bankroll!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  min_stake!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  max_stake!: number

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    transformer: numericTransformer,
  })
  risk_appetite!: number

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    transformer: numericTransformer,
  })
  patience!: number

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    transformer: numericTransformer,
  })
  impulsivity!: number

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    transformer: numericTransformer,
  })
  loss_chasing!: number

  @Column({
    type: 'numeric',
    precision: 4,
    scale: 3,
    transformer: numericTransformer,
  })
  confidence!: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date
}
