import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'

@Entity('notification_views')
export class NotificationView {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  notification_id!: number

  @Column()
  user_id!: number

  @Column({ type: 'timestamp with time zone' })
  viewed_at!: Date
}
