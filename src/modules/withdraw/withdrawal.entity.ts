import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'
import { User } from '../users/user.entity'
import { UserInventory } from '../userInventory/userInventory.entity'
import { numericTransformer } from '../../common/helpers/numericTransformer'

// Lifecycle of one Steam Skins withdrawal request. See migration
// `create_withdrawals.sql` for the full state-machine doc and per-column
// rationale; this enum mirrors the SQL CHECK constraint.
export enum WithdrawalStatus {
  Pending = 'pending',           // row created, TM not yet called
  Purchasing = 'purchasing',     // /buy-for in flight or accepted, awaiting match
  Delivering = 'delivering',     // TM matched a seller, Steam trade sent
  Completed = 'completed',       // user accepted the trade; final
  Failed = 'failed',             // TM rejected / no offers / trade declined
}

export type WithdrawalGameType = 'csgo' | 'dota'

@Entity('withdrawals')
export class Withdrawal {
  @PrimaryGeneratedColumn()
  id!: number

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Column({ type: 'integer' })
  user_id!: number

  // The user_inventory row this withdrawal is consuming. The XOR-FK
  // there decides which catalog (csgo_skins / dota_skins) holds the
  // actual skin metadata; we mirror its `game_type` here for fast
  // filtering and to dispatch the right TM client.
  @ManyToOne(() => UserInventory)
  @JoinColumn({ name: 'inventory_item_id' })
  inventoryItem!: UserInventory

  @Column({ type: 'integer' })
  inventory_item_id!: number

  @Index()
  @Column({ type: 'varchar', length: 16 })
  game_type!: WithdrawalGameType

  @Index()
  @Column({
    type: 'varchar',
    length: 32,
    default: WithdrawalStatus.Pending,
  })
  status!: WithdrawalStatus

  // Returned by TM after `/buy-for`. Nullable until the call lands.
  @Column({ type: 'varchar', length: 128, nullable: true })
  tm_order_id!: string | null

  // Our generated id; TM echoes it back on status polls. UNIQUE so a
  // duplicate TM call (retry) maps to the same withdrawal row.
  @Column({ type: 'varchar', length: 64, unique: true })
  custom_id!: string

  // Full Steam trade-offer URL the user pasted. Stored verbatim for
  // audit / support; parsed `partner` + `token` are passed to TM at
  // call-time, no need to denormalise the parts.
  @Column({ type: 'text' })
  trade_url!: string

  // What we told TM we'd pay (= raw_market_price at request time —
  // the TM buy-for cap we authorised). Markup stays as our profit
  // and isn't sent to TM.
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  target_price!: number

  // What TM actually paid (filled in once status reaches `completed`).
  // May be lower than `target_price` if TM matched a cheaper offer.
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  actual_price!: number | null

  // Human-readable failure detail. Only set when status='failed'.
  // Used by frontend to render "вывод не удался: ..." and by support
  // to triage. Keep PII out of this field.
  @Column({ type: 'text', nullable: true })
  failure_reason!: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date

  @Column({ type: 'timestamptz', nullable: true })
  completed_at!: Date | null
}
