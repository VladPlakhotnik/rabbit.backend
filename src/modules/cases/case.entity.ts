// src/cases/case.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { UserInventory } from '../userInventory/userInventory.entity'
import { SkinCase } from '../skinCase/skinCase.entity'
import { Section } from '../sections/section.entity'
import { numericTransformer } from '../../common/helpers/numericTransformer'

// Which game's skins live in this case. Single source of truth — the
// SkinCase rows for this case must reference skins from the matching
// game's table (csgo_skins or dota_skins). PR3b enforces that link
// once SkinCase becomes polymorphic; for now (PR3a) all existing rows
// remain 'csgo' and Dota cases are created in PR3b.
export type GameType = 'csgo' | 'dota'

@Entity('cases')
export class Case {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar', length: 255 })
  slug!: string

  @Column({ type: 'varchar', length: 100 })
  name!: string

  @Column({ type: 'varchar', length: 255 })
  img_url!: string

  // Filterable on /cases?game=csgo|dota. Defaults to 'csgo' on
  // existing rows via the migration; new rows pass it explicitly
  // (admin tooling / future create endpoint).
  @Column({ type: 'varchar', length: 16, default: 'csgo' })
  game_type!: GameType

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  case_price!: number

  @Column({ type: 'integer' })
  remaining_count!: number

  @Column({ type: 'integer' })
  max_count!: number

  @Column({ type: 'boolean', default: false })
  is_popular!: boolean

  @Column({ type: 'boolean', default: false })
  is_limited!: boolean

  // Soft-lock toggle. When false the case is hidden from the public
  // catalog and detail / open endpoints return 404 — same response a
  // non-existent slug would get, so we don't leak admin state. Set
  // through admin tooling; default true keeps existing cases visible.
  // See migrations/cases_add_is_available.sql.
  @Column({ name: 'is_available', type: 'boolean', default: true })
  is_available!: boolean

  @OneToMany(() => UserInventory, inventory => inventory.case)
  inventories!: UserInventory[]

  @OneToMany(() => SkinCase, skinCase => skinCase.case)
  skinCases!: SkinCase[]

  @ManyToOne(() => Section, section => section.cases)
  @JoinColumn({ name: 'section_id' })
  section!: Section
}
