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
import { ClickerChallenge } from './clicker_challenge.entity'

export type ClickerChallengeProgressStatus =
  | 'in_progress'
  | 'completed'
  | 'claimed'

@Entity('clicker_challenge_progress')
@Index('clicker_challenge_progress_user_challenge_uq', [
  'user_id',
  'challenge_id',
], { unique: true })
export class ClickerChallengeProgress {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ name: 'user_id', type: 'integer' })
  user_id!: number

  @Column({ name: 'challenge_id', type: 'integer' })
  challenge_id!: number

  @ManyToOne(() => ClickerChallenge, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'challenge_id' })
  challenge!: ClickerChallenge

  @Column({ type: 'integer', default: 0 })
  progress!: number

  @Column({ type: 'integer', default: 1 })
  target!: number

  @Column({ type: 'varchar', length: 32, default: 'in_progress' })
  status!: ClickerChallengeProgressStatus

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completed_at!: Date | null

  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimed_at!: Date | null

  @Column({ name: 'last_event_payload', type: 'jsonb', nullable: true })
  last_event_payload!: Record<string, unknown> | null

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
