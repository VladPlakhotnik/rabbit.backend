import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { ClickerChallengeCondition } from './clicker_challenge_condition.entity'

@Entity('clicker_challenges')
@Index('clicker_challenges_key_uq', ['key'], { unique: true })
export class ClickerChallenge {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 80, nullable: true })
  key!: string | null

  @Column({ type: 'varchar', length: 160 })
  name!: string

  @Column({ type: 'text' })
  description!: string

  @Column({ name: 'points_reward', type: 'integer' })
  points_reward!: number

  @Column({ name: 'action_url', type: 'varchar', length: 255, nullable: true })
  action_url!: string | null

  @Column({ name: 'is_active', type: 'boolean', default: true })
  is_active!: boolean

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sort_order!: number

  @ManyToOne(() => ClickerChallengeCondition)
  @JoinColumn({ name: 'condition_id' })
  condition!: ClickerChallengeCondition

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
