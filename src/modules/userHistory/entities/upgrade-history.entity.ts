import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  JoinColumn,
  ManyToOne,
} from 'typeorm'
import { numericTransformer } from '../../../common/helpers/numericTransformer'
import { User } from '../../users/user.entity'

export type UpgradeMode = 'inventory' | 'balance'

// Snapshot of one upgrade material at the moment of the upgrade. Stored as a
// jsonb array so deletion of the source skin from the catalog doesn't
// break history rows.
//
// `game_type` discriminates which catalog `skin_id` belongs to. Today an
// upgrade is single-game (you can't mix CSGO + Dota materials), so all
// materials in one row share the value with the upgrade-level
// `UpgradeHistory.game_type` — the field is duplicated per-material to
// keep the JSON self-describing.
export interface UpgradeHistoryMaterial {
  skin_id: number
  name: string
  rarity: string
  price: number
  game_type?: 'csgo' | 'dota'
}

@Entity('upgrade_history')
export class UpgradeHistory {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'integer' })
  skin_id!: number

  // Discriminator for both `skin_id` (target) and the materials JSONB
  // — values 'csgo' / 'dota'. Default 'csgo' for pre-migration rows.
  // The hydrate path in UserHistoryService dispatches catalog lookup
  // (image, etc.) based on this column.
  @Column({ type: 'varchar', length: 16, default: 'csgo' })
  game_type!: 'csgo' | 'dota'

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
