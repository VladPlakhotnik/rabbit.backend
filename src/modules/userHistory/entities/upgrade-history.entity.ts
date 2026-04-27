import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm'
import { numericTransformer } from '../../../common/helpers/numericTransformer'

export type UpgradeMode = 'inventory' | 'balance'

// Snapshot of one upgrade material at the moment of the upgrade. Stored as a
// jsonb array so deletion of the source skin from `csgo_skins` doesn't break
// history rows.
export interface UpgradeHistoryMaterial {
  skin_id: number
  name: string
  rarity: string
  price: number
}

@Entity('upgrade_history')
export class UpgradeHistory {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

  @Column({ type: 'integer' })
  skin_id!: number

  @Column({ type: 'varchar', length: 100 })
  skin_name!: string

  @Column({ type: 'varchar', length: 50 })
  old_rarity!: string

  @Column({ type: 'varchar', length: 50 })
  new_rarity!: string

  // Postgres `decimal` arrives as a string via `pg`. Without this transformer
  // consumers would do string concat (`"10" + 5 === "105"`) instead of math.
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  cost!: number

  // Snapshot of the target skin's price at the moment of the upgrade. Stored
  // alongside `materials` so a repriced or removed `csgo_skin` can't make a
  // history row render the wrong number. Nullable for pre-migration rows.
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  skin_price!: number | null

  // Whether the upgrade roll succeeded. Nullable for backwards compat with
  // pre-migration rows where this field did not exist.
  @Column({ type: 'boolean', nullable: true })
  success!: boolean | null

  // Server-authoritative chance the upgrade was rolled against (0..100).
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  chance!: number | null

  @Column({ type: 'varchar', length: 16, nullable: true })
  mode!: UpgradeMode | null

  @Column({ type: 'jsonb', nullable: true })
  materials!: UpgradeHistoryMaterial[] | null

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date
}
