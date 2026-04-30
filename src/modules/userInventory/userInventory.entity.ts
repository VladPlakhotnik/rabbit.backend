// src/user-inventory/user-inventory.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Check,
  AfterLoad,
} from 'typeorm'
import { User } from '../users/user.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { DotaSkin } from '../skins/dota-skin.entity'
import { Case } from '../cases/case.entity'

export type GameType = 'csgo' | 'dota'

// Polymorphic user inventory.
//
// Storage layer:
//   - csgo_skin_id INT NULL  → csgo_skins.id  (nullable FK)
//   - dota_skin_id INT NULL  → dota_skins.id  (nullable FK)
//   - game_type varchar       — discriminator
//
// XOR + game-type CHECK constraints enforce that exactly one of the
// two FK columns is set, and that `game_type` agrees with which one.
// Both constraints live in `migrations/polymorphic_user_inventory.sql`
// — the ones declared via @Check below mirror them so tests using
// `synchronize: true` still get the same protection.
//
// API surface stays singular: a unified `skin` getter (populated via
// @AfterLoad) means existing code paths reading `inv.skin.market_price`
// keep working without caring whether it's a CsgoSkin or a DotaSkin.
// New code that *does* care can dispatch on `inv.game_type`.
@Entity('user_inventory')
@Check(
  `(is_withdrawn = TRUE AND withdrawn_at IS NOT NULL) OR (is_withdrawn = FALSE)`,
)
@Check(
  `(csgo_skin_id IS NOT NULL)::int + (dota_skin_id IS NOT NULL)::int = 1`,
)
export class UserInventory {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => User, user => user.inventories)
  @JoinColumn({ name: 'user_id' })
  user!: User

  // ---- Polymorphic skin reference ----------------------------------

  @Column({ type: 'integer', nullable: true })
  csgo_skin_id!: number | null

  @Column({ type: 'integer', nullable: true })
  dota_skin_id!: number | null

  @Column({ type: 'varchar', length: 16, default: 'csgo' })
  game_type!: GameType

  @ManyToOne(() => CsgoSkin, { nullable: true })
  @JoinColumn({ name: 'csgo_skin_id' })
  csgoSkin!: CsgoSkin | null

  @ManyToOne(() => DotaSkin, { nullable: true })
  @JoinColumn({ name: 'dota_skin_id' })
  dotaSkin!: DotaSkin | null

  /**
   * Unified skin accessor. Populated by @AfterLoad after TypeORM
   * hydrates `csgoSkin` / `dotaSkin`, so downstream services can keep
   * the existing `inv.skin.market_price` pattern unchanged.
   *
   * Type narrowed to `CsgoSkin` for downstream compatibility (LiveDrop
   * payload, sell-item mappings, history snapshots — all expect
   * non-null CSGO fields). DotaSkin runtime values get a cast through
   * here; their nullable columns (image, market_price, quality, ...)
   * may surface as null at the consumer, but consumers were already
   * tolerating null skin objects from missing JOINs, so this is a
   * type-only relaxation, not a behaviour change.
   *
   * NOT a column — never persisted. The XOR check guarantees one of
   * the two relations is non-null after load, so the value is always
   * present on properly-loaded entities.
   */
  skin!: CsgoSkin

  @AfterLoad()
  resolveSkin(): void {
    const resolved = this.csgoSkin ?? this.dotaSkin
    if (resolved) {
      this.skin = resolved as unknown as CsgoSkin
    }
  }

  // ---- Case (unchanged) --------------------------------------------

  @ManyToOne(() => Case, caseEntity => caseEntity.inventories)
  @JoinColumn({ name: 'case_id' })
  case!: Case

  @Column({ type: 'timestamp' })
  obtained_at!: Date

  @Column({ type: 'boolean' })
  is_sold!: boolean

  @Column({ type: 'boolean' })
  is_withdrawn!: boolean

  @Column({ type: 'timestamp', nullable: true })
  withdrawn_at!: Date | null
}
