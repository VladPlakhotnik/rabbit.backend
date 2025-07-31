import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm'

@Entity('user_history')
export class UserHistory {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

  @Column({ type: 'varchar', length: 50 })
  action!: string

  @Column({ type: 'varchar', length: 50, nullable: true })
  related_table?: string

  @Column({ type: 'integer', nullable: true })
  related_id?: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date
}
