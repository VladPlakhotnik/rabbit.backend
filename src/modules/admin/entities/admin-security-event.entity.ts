import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { Admin } from './admin.entity'

export type AdminSecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'login_blocked'
  | 'account_locked'
  | 'password_changed'
  | 'password_change_failed'
  | 'totp_setup_started'
  | 'totp_setup_failed'
  | 'totp_enabled'
  | 'totp_disable_failed'
  | 'totp_disabled'
  | 'session_revoked'
  | 'sessions_revoked'
  | 'refresh_reuse_detected'

@Entity('admin_security_events')
export class AdminSecurityEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @ManyToOne(() => Admin, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'admin_id' })
  admin!: Admin | null

  @Index()
  @Column({ type: 'uuid', nullable: true, name: 'admin_id' })
  admin_id!: string | null

  @Column({ type: 'varchar', length: 254, nullable: true, name: 'admin_email' })
  admin_email!: string | null

  @Index()
  @Column({ type: 'varchar', length: 64 })
  type!: AdminSecurityEventType

  @Column({ type: 'varchar', length: 45, nullable: true, name: 'ip_address' })
  ip_address!: string | null

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'user_agent' })
  user_agent!: string | null

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date
}

