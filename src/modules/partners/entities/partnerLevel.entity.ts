import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { numericTransformer } from '../../../common/helpers/numericTransformer'

/**
 * Admin-editable rate card for the partnership program. One row per
 * tier — Bronze..Diamond. The `level` column matches the
 * `PartnerLevel` enum values used on `partner_profiles.level` and
 * uniquely identifies a tier.
 *
 * Why a table (not enum / hardcoded constants):
 *   - rates and thresholds are configuration, not code;
 *   - admin can tweak a percentage without a deploy;
 *   - frontend reads tier metadata from one source instead of
 *     duplicating the values in a hardcoded array.
 *
 * Visual artwork (medal PNGs) stays on the frontend — this table only
 * carries the slug (`bronze`/`silver`/...) so the frontend resolves
 * the asset by name. Storing image bytes in PG would gain nothing.
 */
@Entity('partner_levels')
export class PartnerLevelConfig {
  @PrimaryGeneratedColumn()
  id!: number

  /**
   * Tier index (1..5). Unique — admin shouldn't accidentally insert a
   * second Silver row. Marked unique at the DB level via the migration
   * (`IDX_partner_levels_level_unique`); the index here mirrors it for
   * TypeORM's reflection.
   */
  @Index('IDX_partner_levels_level_unique', { unique: true })
  @Column({ type: 'smallint' })
  level!: number

  /**
   * Slug — `bronze`, `silver`, `gold`, `platinum`, `diamond`. Frontend
   * uses this as the asset key for the medal image and as the i18n
   * lookup suffix (`partnership.bronze`, etc).
   */
  @Column({ type: 'varchar', length: 32 })
  name!: string

  /**
   * Cumulative deposit threshold from referrals required to qualify
   * for this level. Bronze = 0 (everyone starts here). Compared
   * against `partner_profiles.total_referrals_deposit` by
   * `recomputeLevel`.
   */
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  min_referrals_deposit!: number

  /**
   * Percent of a referral's deposit credited to the partner's
   * referral_balance. Stored as percent (0.20 = 0.20%). Read by the
   * future deposit-accrual hook to know how much to credit.
   */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  your_percentage!: number

  /**
   * Percent shown to the referral as their bonus when entering the
   * code. Read by promo-material banners ("+15% on first deposit")
   * and by the bonus accrual when a referral redeems.
   */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  referral_percentage!: number

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
