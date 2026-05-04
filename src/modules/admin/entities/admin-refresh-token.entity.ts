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

// One row per refresh token ever issued. Tokens are bcrypt-hashed
// before storage so a DB leak alone can't be used to forge refreshes.
//
// Rotation rules (enforced in AdminAuthService.refresh):
//   - On every /admin/auth/refresh, the presented token is marked
//     used_at and a brand-new refresh + access pair is issued.
//   - If a token is presented after used_at is set → token reuse
//     attack — revoke EVERY active refresh for that admin.
//   - If revoked_at is set → reject (whether or not it expired).
@Entity('admin_refresh_tokens')
export class AdminRefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @ManyToOne(() => Admin, (admin) => admin.refresh_tokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_id' })
  admin!: Admin

  @Index()
  @Column({ type: 'uuid', name: 'admin_id' })
  admin_id!: string

  // bcrypt hash of the token's `jti` claim. We store the hash, not
  // the token itself, so DB compromise doesn't yield active sessions.
  @Column({ type: 'varchar', length: 100, name: 'token_hash' })
  token_hash!: string

  @Index()
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expires_at!: Date

  // Set when the token is consumed by /refresh. Presenting a token
  // whose used_at is non-null is a reuse-attack signal.
  @Column({ type: 'timestamptz', nullable: true, name: 'used_at' })
  used_at!: Date | null

  // Set when explicitly invalidated (logout, password change,
  // reuse-attack response). Distinct from `used_at` — used = consumed
  // legitimately, revoked = killed.
  @Column({ type: 'timestamptz', nullable: true, name: 'revoked_at' })
  revoked_at!: Date | null

  @Column({ type: 'varchar', length: 45, nullable: true, name: 'ip_address' })
  ip_address!: string | null

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'user_agent' })
  user_agent!: string | null

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date
}
