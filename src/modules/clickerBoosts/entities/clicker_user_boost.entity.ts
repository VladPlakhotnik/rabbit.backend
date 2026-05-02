import { Entity, Column, UpdateDateColumn, PrimaryColumn } from 'typeorm'

/**
 * Per-player stockpile counter. Composite key (user_id, boost_key)
 * matches the natural query — "how many copies of this boost does
 * this user own?" — so every read / write is O(1).
 */
@Entity('clicker_user_boosts')
export class ClickerUserBoost {
  @PrimaryColumn({ name: 'user_id', type: 'integer' })
  user_id!: number

  @PrimaryColumn({ name: 'boost_key', type: 'varchar', length: 64 })
  boost_key!: string

  @Column({ type: 'integer', default: 0 })
  count!: number

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
