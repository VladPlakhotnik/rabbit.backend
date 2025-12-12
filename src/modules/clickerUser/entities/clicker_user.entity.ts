import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'

import { ClickerLevel } from '../../clickerLevels/entities/clicker_level.entity'
import { ClickerClickLevel } from '../../clickerClickLevels/entities/clicker_click_level.entity'
import { ClickerEnergyLevel } from '../../clickerEnergyLevels/entities/clicker_energy_level.entity'

@Entity('clicker_users')
export class ClickerUser {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ name: 'user_id' })
  user_id!: number

  @ManyToOne(() => ClickerLevel)
  @JoinColumn({ name: 'level_id' })
  level!: ClickerLevel

  @ManyToOne(() => ClickerClickLevel)
  @JoinColumn({ name: 'click_level_id' })
  click_level!: ClickerClickLevel

  @ManyToOne(() => ClickerEnergyLevel)
  @JoinColumn({ name: 'energy_level_id' })
  energy_level!: ClickerEnergyLevel

  @Column({ default: 0 })
  energy_amount!: number

  @Column({ default: 0 })
  points!: number

  @Column({
    name: 'last_energy_update',
    type: 'timestamp',
  })
  last_energy_update!: Date

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
