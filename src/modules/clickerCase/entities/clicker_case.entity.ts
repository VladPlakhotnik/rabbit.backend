import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm'
import { ClickerSkinCase } from './clicker_skin_case.entity'

/**
 * Clicker (carrot-currency) case. Mirrors the structure of the regular CSGO
 * `cases` table — same slug-based addressing, same popularity / limited-run
 * flags — but priced in clicker `points` instead of USD balance.
 *
 * The skin pool lives in `clicker_skin_case` (junction). `game_type`
 * mirrors the regular cases table — currently every clicker case is
 * 'csgo', but the column stays so the shop's CS / Dota tab filters
 * extend cleanly when Dota clicker cases land.
 */
export type ClickerCaseGameType = 'csgo' | 'dota'

@Entity('clicker_cases')
export class ClickerCase {
  @PrimaryGeneratedColumn()
  id!: number

  /**
   * URL-safe identifier the API addresses the case by — `/clicker-cases/:slug`.
   * Unique. Set in seed data; admin tooling validates uniqueness on create.
   */
  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string

  @Column({ type: 'varchar', length: 100 })
  name!: string

  @Column({ type: 'varchar', length: 500, default: '' })
  description!: string

  @Column({ name: 'image_url', type: 'varchar', length: 255 })
  image_url!: string

  /**
   * Price in clicker points (carrots). Integer — fractional carrots don't
   * exist. The same column existed before; only the documented unit changes.
   */
  @Column({ name: 'case_price', type: 'integer' })
  case_price!: number

  @Column({
    name: 'game_type',
    type: 'varchar',
    length: 16,
    default: 'csgo',
  })
  game_type!: ClickerCaseGameType

  @Column({ name: 'is_popular', type: 'boolean', default: false })
  is_popular!: boolean

  @Column({ name: 'is_limited', type: 'boolean', default: false })
  is_limited!: boolean

  /**
   * Soft toggle for hiding a case behind a "locked" overlay in the shop.
   * Defaults true; admin flips to false to render the case unopenable
   * without removing the row (preserves history / inventory FKs).
   */
  @Column({ name: 'is_available', type: 'boolean', default: true })
  is_available!: boolean

  /**
   * For limited series. `remaining_count` decrements on each open until the
   * case becomes unavailable; `max_count` is the original supply for UI
   * progress bars. Both default to 0 — non-limited cases ignore them.
   */
  @Column({ name: 'remaining_count', type: 'integer', default: 0 })
  remaining_count!: number

  @Column({ name: 'max_count', type: 'integer', default: 0 })
  max_count!: number

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date

  @OneToMany(() => ClickerSkinCase, skinCase => skinCase.case)
  skinCases!: ClickerSkinCase[]
}
