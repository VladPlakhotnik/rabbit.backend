// src/skin-case/skin-case.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { Case } from '../cases/case.entity'
import { CsgoSkin } from '../skins/csgo-skin.entity'
import { numericTransformer } from '../../common/helpers/numericTransformer'

export type GameType = 'csgo' | 'dota'

// Junction case ↔ skin. Polymorphic across CSGO and Dota by way of the
// `game_type` discriminator column (added in
// migrations/seed_dota_starter_case.sql, which also dropped the legacy
// FK skin_case → csgo_skins).
//
// The TypeORM ManyToOne to CsgoSkin below stays — for CSGO rows it
// joins as before via skin_hash_name → csgo_skins.market_hash_name.
// For Dota rows the same hash_name doesn't exist in csgo_skins so the
// JOIN comes back null; the `case.service.ts` flow detects
// `case.game_type === 'dota'` and hydrates `skin` manually from
// dota_skins. Tighter polymorphism (a typed discriminated union, two
// separate FK columns, etc.) is deliberately deferred — this junction
// table is reseeded easily, integrity is application-level.
@Entity('skin_case')
export class SkinCase {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => Case, caseEntity => caseEntity.skinCases)
  @JoinColumn({ name: 'case_id' })
  case!: Case

  @Column({ type: 'varchar', nullable: true })
  skin_hash_name?: string

  @Column({ type: 'varchar', length: 16, default: 'csgo' })
  game_type!: GameType

  // Type stays `CsgoSkin` for legacy callers (LiveDrop builder, bots,
  // upgrade) that consume non-null CSGO-only fields. Dota rows are
  // hydrated by `case.service.ts` with a `as unknown as CsgoSkin` cast
  // — runtime substitutes a DotaSkin instance, which shares the column
  // names downstream code touches (image, market_hash_name,
  // market_price, name_color, background_color, quality, name).
  // Proper discriminated union polymorphism here would cascade into
  // every consumer; deferred until the rest of PR3b lands.
  @ManyToOne(() => CsgoSkin, { nullable: true })
  @JoinColumn({
    name: 'skin_hash_name',
    referencedColumnName: 'market_hash_name',
  })
  skin!: CsgoSkin

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: numericTransformer,
  })
  chance!: number

  @Column({ type: 'boolean' })
  is_drop_out!: boolean
}
