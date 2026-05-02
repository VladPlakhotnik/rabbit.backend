import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

/**
 * Bunny rank ladder. Pure progression — `points_required` is the cumulative
 * points threshold a player must cross to reach this level. The per-click
 * reward and energy cap come from `clicker_click_levels` and
 * `clicker_energy_levels` respectively, so this table never duplicates them.
 */
@Entity('clicker_levels')
export class ClickerLevel {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  level!: number

  @Column()
  image_url!: string

  @Column({ name: 'points_required' })
  points_required!: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
