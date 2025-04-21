import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'
import { RewardType } from '../enums/reward-type.enum'

@Entity('rewards')
export class Reward {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({
    type: 'enum',
    enum: RewardType,
  })
  type!: RewardType

  @Column({ type: 'varchar' })
  name!: string

  @Column({ type: 'text', nullable: true })
  description?: string

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  value!: number

  @Column({ type: 'float' })
  drop_chance!: number

  @Column({ type: 'boolean', default: true })
  is_active!: boolean

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date
}
