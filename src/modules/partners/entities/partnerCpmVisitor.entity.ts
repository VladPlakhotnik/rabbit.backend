import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm'

@Entity('partner_cpm_visitors')
@Index(
  'IDX_partner_cpm_visitors_partner_hash_day_unique',
  ['partner_user_id', 'visitor_hash', 'day'],
  { unique: true },
)
export class PartnerCpmVisitor {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'int' })
  partner_user_id!: number

  @Column({ type: 'varchar', length: 64 })
  referral_code!: string

  @Column({ type: 'int', nullable: true })
  campaign_id!: number | null

  @Column({ type: 'varchar', length: 64 })
  visitor_hash!: string

  @Column({ type: 'date' })
  day!: string

  @Column({ type: 'varchar', length: 128, nullable: true })
  source!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  sub_id!: string | null

  @CreateDateColumn()
  created_at!: Date
}
