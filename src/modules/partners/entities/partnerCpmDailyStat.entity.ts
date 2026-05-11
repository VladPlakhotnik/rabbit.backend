import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { numericTransformer } from '../../../common/helpers/numericTransformer'

@Entity('partner_cpm_daily_stats')
@Index(
  'IDX_partner_cpm_daily_stats_partner_code_day_unique',
  ['partner_user_id', 'referral_code', 'day'],
  { unique: true },
)
export class PartnerCpmDailyStat {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'int' })
  partner_user_id!: number

  @Column({ type: 'varchar', length: 64 })
  referral_code!: string

  @Column({ type: 'int', nullable: true })
  campaign_id!: number | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  source!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  sub_id!: string | null

  @Column({ type: 'date' })
  day!: string

  @Column({ type: 'int', default: 0 })
  impressions!: number

  @Column({ type: 'int', default: 0 })
  unique_impressions!: number

  @Column({ type: 'int', default: 0 })
  payable_impressions!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 4,
    default: 0,
    transformer: numericTransformer,
  })
  estimated_amount!: number

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
