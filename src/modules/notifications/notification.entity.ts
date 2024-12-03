// src/notifications/notification.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { User } from '../users/user.entity'

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 100 })
  title!: string

  @Column({ type: 'text' })
  message!: string

  @Column({ type: 'timestamp' })
  created_at!: Date

  @Column({ type: 'boolean' })
  is_important!: boolean

  @ManyToOne(() => User, user => user.notifications, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null
}
