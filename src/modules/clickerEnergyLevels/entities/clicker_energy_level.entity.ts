import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('clicker_energy_levels')
export class ClickerEnergyLevel {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  level!: number

  @Column({ name: 'image_url' })
  image_url!: string

  @Column({ name: 'energy_amount' })
  energy_amount!: number

  @Column({ name: 'upgrade_cost' })
  upgrade_cost!: number

  /**
   * Energy units regenerated per second × 1000 (milli-units). Bootstrap
   * reads this and writes it directly to the Redis hash `r` field
   * the click Lua consumes. Per-level so a level-10 cap (50k) doesn't
   * inherit a level-1 trickle rate. Migration
   * `clicker_energy_level_per_level_regen.sql` backfills the seeded
   * values; the env override CLICKER_ENERGY_REGEN_PER_SEC stays as a
   * global fallback for rows that haven't been backfilled.
   */
  @Column({ name: 'regen_per_sec_milli', default: 0 })
  regen_per_sec_milli!: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
