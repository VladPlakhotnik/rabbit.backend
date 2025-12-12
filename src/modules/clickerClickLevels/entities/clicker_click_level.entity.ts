import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('clicker_click_levels')
export class ClickerClickLevel {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  level!: number

  @Column({ name: 'image_url' })
  image_url!: string

  @Column({ name: 'reward_per_click' })
  reward_per_click!: number

  @Column({ name: 'upgrade_cost' })
  upgrade_cost!: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
