import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('clicker_crit_click_levels')
export class ClickerCritClickLevel {
  @PrimaryGeneratedColumn()
  id!: number

  @Column()
  level!: number

  @Column({ name: 'upgrade_cost' })
  upgrade_cost!: number

  /**
   * Crit chance as an integer percent (0-100). The Lua click script
   * rolls per-click and pays out the crit multiplier when the roll
   * lands under this number.
   */
  @Column({ name: 'crit_chance_pct' })
  crit_chance_pct!: number

  @Column({ name: 'image_url', default: '' })
  image_url!: string

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
