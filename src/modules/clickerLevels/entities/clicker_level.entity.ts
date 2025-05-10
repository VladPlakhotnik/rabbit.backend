import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('clicker_levels')
export class ClickerLevel {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  level!: number

  @Column()
  image_url!: string

  @Column()
  reward_per_click!: number

  @Column()
  upgrade_cost!: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
