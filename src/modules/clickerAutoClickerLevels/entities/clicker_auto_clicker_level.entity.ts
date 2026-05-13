import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('clicker_auto_clicker_levels')
export class ClickerAutoClickerLevel {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  level!: number

  @Column({ name: 'upgrade_cost' })
  upgrade_cost!: number

  /** Max idle-bank accumulation cap for this tier, in seconds. */
  @Column({ name: 'duration_sec' })
  duration_sec!: number

  @Column({ name: 'image_url', default: '' })
  image_url!: string

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
