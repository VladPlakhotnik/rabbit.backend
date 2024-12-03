// src/bonuses/bonus.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { User } from '../users/user.entity'

@Entity('bonuses')
export class Bonus {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => User, user => user.bonuses)
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'varchar', length: 50 })
  bonus_type!: string

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: number

  @Column({ type: 'timestamp' })
  last_claimed!: Date

  @Column({ type: 'timestamp' })
  next_available!: Date
}
