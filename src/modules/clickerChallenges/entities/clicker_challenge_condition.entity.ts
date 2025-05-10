import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('clicker_challenge_conditions')
export class ClickerChallengeCondition {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  type!: string

  @Column()
  target!: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
