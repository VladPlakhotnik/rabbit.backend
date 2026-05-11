import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { numericTransformer } from '../../../common/helpers/numericTransformer'

export enum PartnerLedgerType {
  REVSHARE = 'REVSHARE',
  CPM = 'CPM',
  BONUS = 'BONUS',
  PAYOUT = 'PAYOUT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum PartnerLedgerStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
}

@Entity('partner_commission_ledger')
@Index('IDX_partner_commission_ledger_partner_created', [
  'partner_user_id',
  'created_at',
])
export class PartnerCommissionLedger {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'int' })
  partner_user_id!: number

  @Column({ type: 'int', nullable: true })
  campaign_id!: number | null

  @Column({ type: 'enum', enum: PartnerLedgerType })
  type!: PartnerLedgerType

  @Column({ type: 'enum', enum: PartnerLedgerStatus })
  status!: PartnerLedgerStatus

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 4,
    default: 0,
    transformer: numericTransformer,
  })
  amount!: number

  @Column({ type: 'varchar', length: 128, nullable: true })
  reference!: string | null

  @Column({ type: 'text', nullable: true })
  description!: string | null

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null

  @CreateDateColumn()
  created_at!: Date
}
