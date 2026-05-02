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

// Constrained shape for i18n params — keep the JSON payload to
// primitives so admin tooling can render and edit them safely. Nested
// objects/arrays would invite drift between the schema the frontend
// expects and what the backend actually writes.
export type NotificationParams = Record<
  string,
  string | number | boolean | null
>

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id!: number

  // Free-form path. Either nullable (typed event uses i18n_key path
  // instead) or a complete title+message pair (admin broadcast). The
  // SQL CHECK in migrations/add_notifications_i18n.sql enforces that
  // at least one of the two paths is filled.
  @Column({ type: 'varchar', length: 100, nullable: true })
  title!: string | null

  @Column({ type: 'text', nullable: true })
  message!: string | null

  // Typed-event path. `i18n_key` is the short key the frontend prefixes
  // with `notifications.events.` to look up the translation
  // (e.g. 'withdraw.completed' →
  //  notifications.events.withdraw.completed.{title,message}).
  @Column({ type: 'varchar', length: 120, nullable: true })
  i18n_key!: string | null

  @Column({ type: 'jsonb', nullable: true })
  i18n_params!: NotificationParams | null

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
