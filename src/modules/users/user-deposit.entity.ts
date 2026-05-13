import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { numericTransformer } from '../../common/helpers/numericTransformer'

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
export class UserDeposit {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  user_id!: number

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

  @Column({ type: 'varchar', length: 255, nullable: true })
  failure_reason!: string | null

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date
}
