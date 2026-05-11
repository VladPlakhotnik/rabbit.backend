import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity('partner_postback_settings')
@Index('IDX_partner_postback_settings_user_unique', ['user_id'], {
  unique: true,
})
export class PartnerPostbackSetting {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'int' })
  user_id!: number

  @Column({ type: 'boolean', default: false })
  enabled!: boolean

  @Column({ type: 'varchar', length: 512, nullable: true })
  postback_url!: string | null

  @Column({ type: 'varchar', length: 64 })
  secret!: string

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
