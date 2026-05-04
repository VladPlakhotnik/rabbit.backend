import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'
import { AdminRole } from '../types/admin-role.enum'
import { AdminRefreshToken } from './admin-refresh-token.entity'

// Admin panel staff. Completely separate from `users` (regular game
// users) — different auth flow, different table, different lifecycle.
// One admin = one human; OAuth (Google/Steam/Telegram) is for game
// users only, admins authenticate with email + bcrypt password.
@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 254 })
  email!: string

  // bcrypt hash, cost 12. Never returned in API responses (filtered
  // in toSafeJson() below).
  @Column({ type: 'varchar', length: 100, name: 'password_hash' })
  password_hash!: string

  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  first_name!: string

  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  last_name!: string

  @Column({
    type: 'enum',
    enum: AdminRole,
    default: AdminRole.MANAGER,
  })
  role!: AdminRole

  // Soft-disable flag. Lets you revoke access without deleting the
  // record (which would orphan audit-trail FKs in future tables).
  @Column({ type: 'boolean', default: true, name: 'is_active' })
  is_active!: boolean

  // ─── Brute-force / lockout tracking ────────────────────────────

  @Column({ type: 'int', default: 0, name: 'failed_login_attempts' })
  failed_login_attempts!: number

  @Column({ type: 'timestamptz', nullable: true, name: 'locked_until' })
  locked_until!: Date | null

  // ─── Audit fields ──────────────────────────────────────────────

  @Column({ type: 'timestamptz', nullable: true, name: 'last_login_at' })
  last_login_at!: Date | null

  @Column({ type: 'varchar', length: 45, nullable: true, name: 'last_login_ip' })
  last_login_ip!: string | null

  // Who created this admin (NULL for the initial bootstrap super_admin).
  @ManyToOne(() => Admin, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  created_by!: Admin | null

  @Column({ type: 'uuid', nullable: true, name: 'created_by_id' })
  created_by_id!: string | null

  // ─── 2FA-ready (not used yet, but field exists so we don't need
  //     a migration when we turn it on) ─────────────────────────────

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'totp_secret' })
  totp_secret!: string | null

  @Column({ type: 'boolean', default: false, name: 'totp_enabled' })
  totp_enabled!: boolean

  // ─── Timestamps ────────────────────────────────────────────────

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date

  // ─── Relations ─────────────────────────────────────────────────

  @OneToMany(() => AdminRefreshToken, (token) => token.admin)
  refresh_tokens!: AdminRefreshToken[]

  // Strip secrets before serialising to clients. Always use this in
  // controllers — never return the raw entity.
  toSafeJson(): SafeAdmin {
    return {
      id: this.id,
      email: this.email,
      first_name: this.first_name,
      last_name: this.last_name,
      role: this.role,
      is_active: this.is_active,
      last_login_at: this.last_login_at,
      totp_enabled: this.totp_enabled,
      created_at: this.created_at,
      updated_at: this.updated_at,
    }
  }
}

export interface SafeAdmin {
  id: string
  email: string
  first_name: string
  last_name: string
  role: AdminRole
  is_active: boolean
  last_login_at: Date | null
  totp_enabled: boolean
  created_at: Date
  updated_at: Date
}
