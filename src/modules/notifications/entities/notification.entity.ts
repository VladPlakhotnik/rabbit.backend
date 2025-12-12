// src/notifications/notification.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { User } from '../../users/user.entity'

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

  @Column({ default: false })
  is_viewed!: boolean

  @Column({ type: 'timestamp with time zone', nullable: true })
  viewed_at!: Date | null

  @Index()
  @Column()
  user_id!: number

  // @ManyToOne(() => User, user => user.notifications, { nullable: true })
  // @JoinColumn({ name: 'user_id' })
  // user!: User | null
}
