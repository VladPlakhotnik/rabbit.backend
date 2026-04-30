import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm'
import { numericTransformer } from '../../common/helpers/numericTransformer'
import { SkinStatus } from './shared/skin-status.enum'

@Entity('dota_skins')
export class DotaSkin {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 255, unique: true })
  market_hash_name!: string

  // Same lifecycle states as CsgoSkin — see SkinStatus enum.
  @Column({
    type: 'varchar',
    length: 32,
    default: SkinStatus.Available,
  })
  status!: SkinStatus

  @Column({ type: 'timestamp with time zone', nullable: true })
  last_seen_in_feed_at!: Date | null

  // Display price (= raw × (1 + markup)), what users see and pay.
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  market_price!: number | null

  // Real marketplace price — used as `buy-for` cap on withdrawal.
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  raw_market_price!: number | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  amount_in_market!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null

  @Column({ type: 'varchar', length: 1024, nullable: true })
  image!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  slug!: string | null

  @Column({ type: 'varchar', length: 1024, nullable: true })
  inspect_in_game!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  name_color!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  background_color!: string | null

  // Dota-specific cosmetic tiers — see migration for the value space.
  // `quality` is the visual qualifier ("Genuine", "Strange",
  // "Inscribed", "Heroic"), distinct from `rarity` ("Mythical",
  // "Legendary", "Immortal", "Arcana") which is the drop-tier.
  @Column({ type: 'varchar', length: 64, nullable: true })
  quality!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  rarity!: string | null

  // Bound hero ("Pudge", "Anti-Mage", ...). Most Dota cosmetics are
  // hero-bound; some are couriers / ward / HUDs and have null here.
  @Column({ type: 'varchar', length: 128, nullable: true })
  hero!: string | null

  // Equipment slot ("weapon", "head", "armor", "shoulder", "back",
  // "courier", "ward"). Useful for grouping in the inventory UI.
  @Column({ type: 'varchar', length: 64, nullable: true })
  slot!: string | null

  @Column({ type: 'varchar', length: 255, array: true, nullable: true })
  collection!: string[] | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  category!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  item_type!: string | null

  @Column({ type: 'boolean', default: false })
  is_new!: boolean

  // ---- TM class_instance fields (see csgo-skin.entity.ts for the
  // full rationale; same semantics here, only `rarity` already
  // existed on this entity from the original schema so it isn't
  // re-added). Migration: migrations/add_tm_market_fields.sql.

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  buy_order!: number | null

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  avg_price!: number | null

  @Column({ type: 'integer', nullable: true })
  popularity_7d!: number | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  ru_name!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  ru_quality!: string | null

  @Column({ type: 'varchar', length: 32, nullable: true })
  phase!: string | null

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
