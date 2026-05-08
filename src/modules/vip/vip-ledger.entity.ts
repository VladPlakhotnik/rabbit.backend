import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { numericTransformer } from '../../common/helpers/numericTransformer'
import { User } from '../users/user.entity'
import type { VipLedgerSourceType } from './vip-earning.logic'

@Entity('vip_ledger')
export class VipLedger {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string

  @Column({ name: 'user_id', type: 'int' })
  user_id!: number

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ name: 'source_type', type: 'varchar', length: 40 })
  source_type!: VipLedgerSourceType

  @Column({ name: 'source_id', type: 'varchar', length: 80, nullable: true })
  source_id!: string | null

  @Column({
    name: 'wager_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  wager_amount!: number

  @Column({ name: 'house_edge_bps', type: 'int', default: 0 })
  house_edge_bps!: number

  @Column({ name: 'product_xp_rate_bps', type: 'int', default: 10000 })
  product_xp_rate_bps!: number

  @Column({
    name: 'theoretical_rake',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  theoretical_rake!: number

  @Column({
    name: 'vip_xp',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  vip_xp!: number

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  created_at!: Date
}
