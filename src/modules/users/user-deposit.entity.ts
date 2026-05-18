import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { numericTransformer } from '../../common/helpers/numericTransformer'
import { User } from './user.entity'

export enum UserDepositStatus {
  WAITING = 'waiting',
  SUCCESS = 'success',
  ERROR = 'error',
  CANCELLED = 'cancelled',
}

@Entity('user_deposits')
@Index('idx_user_deposits_user_created_at', ['user_id', 'created_at'])
@Index('idx_user_deposits_user_status_created_at', [
  'user_id',
  'status',
  'created_at',
])
@Index('IDX_user_deposits_source_external_order_id', [
  'source',
  'external_order_id',
], {
  unique: true,
  where: '"external_order_id" IS NOT NULL',
})
@Index('IDX_user_deposits_source_external_id', ['source', 'external_id'], {
  unique: true,
  where: '"external_id" IS NOT NULL',
})
export class UserDeposit {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  bonus_amount!: number

  @Column({
    type: 'varchar',
    length: 24,
    default: UserDepositStatus.WAITING,
  })
  status!: UserDepositStatus

  @Column({ type: 'varchar', length: 64, nullable: true })
  source!: string | null

  @Column({ type: 'varchar', length: 128, nullable: true, name: 'external_id' })
  external_id!: string | null

  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
    name: 'external_order_id',
  })
  external_order_id!: string | null

  @Column({
    type: 'varchar',
    length: 32,
    nullable: true,
    name: 'provider_status',
  })
  provider_status!: string | null

  @Column({
    type: 'jsonb',
    default: () => "'{}'::jsonb",
    name: 'provider_payload',
  })
  provider_payload!: Record<string, unknown>

  @Column({ type: 'timestamptz', nullable: true, name: 'credited_at' })
  credited_at!: Date | null

  @Column({ type: 'varchar', length: 32, nullable: true, name: 'steam_id' })
  steam_id!: string | null

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    name: 'trade_offer_id',
  })
  trade_offer_id!: string | null

  @Column({ type: 'varchar', length: 255, nullable: true })
  failure_reason!: string | null

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
