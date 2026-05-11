import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

export enum PartnerCampaignStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
}

@Entity('partner_campaigns')
@Index('IDX_partner_campaigns_user_slug_unique', ['user_id', 'slug'], {
  unique: true,
})
export class PartnerCampaign {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'int' })
  user_id!: number

  @Column({ type: 'varchar', length: 64 })
  name!: string

  @Column({ type: 'varchar', length: 64 })
  slug!: string

  @Column({ type: 'varchar', length: 128, default: '/' })
  landing_path!: string

  @Column({ type: 'varchar', length: 64, nullable: true })
  source!: string | null

  @Column({ type: 'varchar', length: 64, nullable: true })
  sub_id!: string | null

  @Column({
    type: 'enum',
    enum: PartnerCampaignStatus,
    default: PartnerCampaignStatus.ACTIVE,
  })
  status!: PartnerCampaignStatus

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
