import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

export type ClickerBoostEffectType = 'infinite_energy' | 'multiplier'

@Entity('clicker_boosts')
export class ClickerBoost {
  @PrimaryGeneratedColumn()
  id!: number

  /** Stable cross-system identifier — used in audit log + Lua + frontend. */
  @Column({ type: 'varchar', length: 64, unique: true })
  key!: string

  @Column({ type: 'varchar', length: 128 })
  name!: string

  @Column({ type: 'varchar', length: 512, nullable: true })
  description!: string | null

  @Column({ type: 'integer' })
  price!: number

  @Column({ name: 'duration_sec', type: 'integer' })
  duration_sec!: number

  /**
   * Tells Lua what the boost does on activation:
   *   'infinite_energy' → click pays no energy while active
   *   'multiplier'      → click reward × effect_value while active
   */
  @Column({ name: 'effect_type', type: 'varchar', length: 32 })
  effect_type!: ClickerBoostEffectType

  /**
   * Multiplier value for `effect_type = 'multiplier'`. Ignored / 0 for
   * `infinite_energy`. Kept on the catalog row (not hardcoded in Lua)
   * so admin tools can balance without a redeploy.
   */
  @Column({ name: 'effect_value', type: 'integer', default: 0 })
  effect_value!: number

  /** Admin soft-lock — see migration. */
  @Column({ name: 'is_available', type: 'boolean', default: true })
  is_available!: boolean

  @Column({ name: 'image_url', type: 'varchar', default: '' })
  image_url!: string

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
