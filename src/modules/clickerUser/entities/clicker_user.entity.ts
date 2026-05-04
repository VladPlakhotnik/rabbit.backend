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

  /**
   * Lifetime carrots earned. Goes up monotonically on every credit
   * (manual clicks, crit bonus, autoclicker ticks, admin grants);
   * never goes down — spending lowers `points`, not this. Drives
   * level progression and the progress-bar fill so the bar doesn't
   * regress when the player spends.
   */
  @Column({ name: 'total_points', default: 0 })
  total_points!: number

  /**
   * Bank-style autoclicker pending fields. Populated by the click Lua
   * during idle accumulation; cleared atomically on a claim. Persisted
   * to Postgres on flush so they survive a Redis eviction (TTL or
   * cache miss); restored to Redis on the next bootstrap.
   *
   * `auto_clicker_pending_count` — number of clicks the autoclicker
   *   has earned but the player hasn't claimed yet.
   * `auto_clicker_pending_value` — points value those clicks would
   *   credit, computed at simulation time so a click upgrade between
   *   accumulation and claim doesn't change the payout (no exploit).
   * `auto_clicker_last_claim_at` — purely audit / forensics; the
   *   click pipeline doesn't read this.
   */
  @Column({ name: 'auto_clicker_pending_count', default: 0 })
  auto_clicker_pending_count!: number

  @Column({ name: 'auto_clicker_pending_value', default: 0 })
  auto_clicker_pending_value!: number

  @Column({
    name: 'auto_clicker_last_claim_at',
    type: 'timestamptz',
    nullable: true,
  })
  auto_clicker_last_claim_at!: Date | null

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
