import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm'

/**
 * Action verbs allowed on the audit log. Frozen as a TS union so the
 * compiler catches typos in service code (vs the DB-level varchar(64)
 * which would silently accept anything).
 */
export type ClickerHistoryAction =
  | 'upgrade_skill'
  | 'click_crit_hit'
  | 'auto_clicker_activate'
  | 'auto_clicker_collect'
  | 'buy_boost'
  | 'activate_boost'
  | 'boost_expire'
  | 'admin_grant_points'

export type ClickerHistorySource = 'ws' | 'rest' | 'cron' | 'admin'

@Entity('clicker_history')
@Index('clicker_history_user_ts_idx', ['user_id', 'ts'])
@Index('clicker_history_action_ts_idx', ['action', 'ts'])
export class ClickerHistory {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string

  @Column({ name: 'user_id', type: 'integer' })
  user_id!: number

  @Column({ type: 'varchar', length: 64 })
  action!: ClickerHistoryAction

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null

  @Column({ name: 'state_before', type: 'jsonb', nullable: true })
  state_before!: Record<string, unknown> | null

  @Column({ name: 'state_after', type: 'jsonb', nullable: true })
  state_after!: Record<string, unknown> | null

  @Column({ type: 'varchar', length: 32, default: 'ws' })
  source!: ClickerHistorySource

  @Column({ type: 'inet', nullable: true })
  ip!: string | null

  @CreateDateColumn({ name: 'ts' })
  ts!: Date
}
