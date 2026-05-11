import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { numericTransformer } from '../../../common/helpers/numericTransformer'

@Entity('partner_campaign_daily_stats')
@Index(
  'IDX_partner_campaign_daily_stats_campaign_day_unique',
  ['partner_user_id', 'campaign_id', 'day'],
  { unique: true },
)
export class PartnerCampaignDailyStat {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'int' })
  partner_user_id!: number

  @Column({ type: 'int' })
  campaign_id!: number

  @Column({ type: 'date' })
  day!: string

  @Column({ type: 'int', default: 0 })
  impressions!: number

  @Column({ type: 'int', default: 0 })
  unique_impressions!: number

  @Column({ type: 'int', default: 0 })
  payable_impressions!: number

  @Column({ type: 'int', default: 0 })
  registrations!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  referral_deposit_amount!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 4,
    default: 0,
    transformer: numericTransformer,
  })
  cpm_estimated_amount!: number

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
