import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { ClickerChallengeCondition } from './clicker_challenge_condition.entity'

@Entity('clicker_challenges')
export class ClickerChallenge {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  name!: string

  @Column()
  description!: string

  @Column({ name: 'points_reward' })
  points_reward!: number

  @ManyToOne(() => ClickerChallengeCondition)
  @JoinColumn({ name: 'condition_id' })
  condition!: ClickerChallengeCondition

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
