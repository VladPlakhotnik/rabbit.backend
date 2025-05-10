import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('clicker_users')
export class ClickerUser {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  user_id!: number

  @Column({ default: 1 })
  level!: number

  @Column({ default: 1 })
  click_level!: number

  @Column({ default: 1 })
  energy_level!: number

  @Column({ default: 0 })
  energy_amount!: number

  @Column({ default: 0 })
  points!: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
