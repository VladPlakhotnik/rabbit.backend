import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

export type ClickerChallengeConditionParams = Record<string, unknown>

@Entity('clicker_challenge_conditions')
export class ClickerChallengeCondition {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 80 })
  type!: string

  @Column({ type: 'integer' })
  target!: number

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  params!: ClickerChallengeConditionParams

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
