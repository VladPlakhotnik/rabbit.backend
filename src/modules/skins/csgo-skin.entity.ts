import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm'
import { numericTransformer } from '../../common/helpers/numericTransformer'
import { SkinStatus } from './shared/skin-status.enum'

@Entity('csgo_skins')
export class CsgoSkin {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 255, unique: true })
  market_hash_name!: string

  // Status drives availability in cases / withdrawals / market UI:
  //   available             — present in the market feed, can drop / be withdrawn
  //   unavailable_on_market — temporarily missing; can drop, can't withdraw
  //   disabled              — admin-disabled; hidden everywhere
  // See SkinStatus enum for the canonical values.
  @Column({
    type: 'varchar',
    length: 32,
    default: SkinStatus.Available,
  })
  status!: SkinStatus

  // Last time this skin was present in the market.csgo.com price feed.
  // Used to drive the "missing → unavailable_on_market" transition and
  // its reverse. Null = never seen (just-created stub) — sync fills it.
  @Column({ type: 'timestamp with time zone', nullable: true })
  last_seen_in_feed_at!: Date | null

  // Parsed components of market_hash_name. Filled by hashNameParser at
  // sync time so the UI can group variants without re-parsing per
  // render. Examples below assume "StatTrak™ AK-47 | Asiimov (FT)":
  //   weapon      → "AK-47"
  //   skin_name   → "Asiimov"
  //   is_stattrak → true
  //   is_souvenir → false
  //   exterior    → "Field-Tested"  (already in the entity below)
  // 255-char ceilings — Music Kit / Sticker tournament hash_names can
  // run long ("Music Kit | Long Artist Name, Long Title"), and we'd
  // rather store the full string than truncate.
  @Column({ type: 'varchar', length: 255, nullable: true })
  weapon!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  skin_name!: string | null

  @Column({ type: 'boolean', default: false })
  is_stattrak!: boolean

  @Column({ type: 'boolean', default: false })
  is_souvenir!: boolean

  @Column({ type: 'varchar', length: 255 })
  name!: string

  // Display price — what users see and pay. Equals
  // `raw_market_price * (1 + SKIN_PRICE_MARKUP)`, recomputed each sync.
  // Kept as `market_price` (instead of renaming) so existing case /
  // upgrade / inventory code that already reads this column doesn't
  // break.
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  market_price!: number

  // Raw price from the marketplace (no markup). Used to cap the
  // `buy-for` bid in the withdrawal flow. Null before the first sync
  // populates it on existing rows; the sync immediately sets it.
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  raw_market_price!: number | null

  @Column({ type: 'varchar' })
  image!: string

  @Column({ type: 'boolean', default: false })
  is_new!: boolean

  @Column({ type: 'varchar', length: 255 })
  amount_in_market!: string

  @Column({ type: 'varchar' })
  inspect_in_game!: string

  @Column({ type: 'varchar', length: 255 })
  quality!: string

  // Nullable: stickers / agents / cases have no exterior; price-feed
  // newly-created stubs may not have it parsed yet either. Existing
  // populated rows are unaffected.
  @Column({ type: 'varchar', length: 255, nullable: true })
  exterior!: string | null

  @Column({ type: 'varchar', length: 255 })
  category!: string

  @Column({ type: 'varchar', length: 255 })
  slug!: string

  @Column({ type: 'varchar', length: 255 })
  name_color!: string

  @Column({ type: 'varchar', length: 255 })
  background_color!: string

  @Column({ type: 'varchar', length: 255 })
  item_type!: string

  @Column({ type: 'varchar', length: 255 })
  collection!: string[]

  @Column({ type: 'float' })
  float_value!: number

  @Column({ type: 'varchar', length: 20 })
  float_part_value!: string

  @Column({ type: 'integer' })
  pattern!: number

  // ---- TM market.csgo.com class_instance fields ---------------------
  // Populated by the daily TM class_instance sync (see csgo-sync.service.ts).
  // Migration: migrations/add_tm_market_fields.sql.

  // Highest current bid: max someone is willing to pay right now.
  // Used as the floor for "instant cash-out" pricing — we'll never
  // give a user more than `buy_order` since that's what we'd actually
  // recover by selling immediately.
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  buy_order!: number | null

  // Moving-average price from recent sales. More stable than
  // `market_price` (which is the current min ask) for showing
  // "fair value" to users.
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  avg_price!: number | null

  // Sales in the last 7 days. Useful as a drop-weight signal —
  // popular skins drop more often, dead-listings drop rarely.
  @Column({ type: 'integer', nullable: true })
  popularity_7d!: number | null

  // Russian display name, e.g. "AK-47 | Азимов (После полевых испытаний)".
  // Stored alongside `name` (which is English / DMarket-sourced) so the
  // UI can show whichever the user's locale needs without a separate
  // i18n lookup.
  @Column({ type: 'varchar', length: 255, nullable: true })
  ru_name!: string | null

  // Russian quality string (e.g. "После полевых испытаний").
  @Column({ type: 'varchar', length: 64, nullable: true })
  ru_quality!: string | null

  // Rarity tier in Russian (e.g. "Тайное", "Засекреченное"). Distinct
  // from `quality` (DMarket's English label) — kept separate to avoid
  // cross-language collisions.
  @Column({ type: 'varchar', length: 64, nullable: true })
  rarity!: string | null

  // Doppler / Marble Fade phase. Empty string for non-phase skins.
  @Column({ type: 'varchar', length: 32, nullable: true })
  phase!: string | null

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date

  @OneToMany('SkinCase', 'skin')
  skinCases!: any[]
}
