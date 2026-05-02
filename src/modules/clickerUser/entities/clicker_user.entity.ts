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
import { ClickerAutoClickerLevel } from '../../clickerAutoClickerLevels/entities/clicker_auto_clicker_level.entity'
import { ClickerCritClickLevel } from '../../clickerCritClickLevels/entities/clicker_crit_click_level.entity'

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

  /**
   * Optional skill — `null` until the player buys auto-clicker from the
   * Shop. Null on the FK = "skill not unlocked", which the click /
   * activate paths special-case (no autoclick gets generated).
   */
  @ManyToOne(() => ClickerAutoClickerLevel, { nullable: true })
  @JoinColumn({ name: 'auto_clicker_level_id' })
  auto_clicker_level!: ClickerAutoClickerLevel | null

  /** Same shape as `auto_clicker_level` — null = crit chance is 0. */
  @ManyToOne(() => ClickerCritClickLevel, { nullable: true })
  @JoinColumn({ name: 'crit_click_level_id' })
  crit_click_level!: ClickerCritClickLevel | null

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
