import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { User } from '../../users/user.entity'

// One row per refresh token ever issued. Tokens are bcrypt-hashed
// before storage so a DB leak alone can't be used to forge refreshes.
//
// Rotation rules (enforced in AuthService.refresh):
//   - On every /auth/refresh, the presented token is marked used_at
//     and a brand-new refresh + access pair is issued.
//   - If a token is presented after used_at is set → token reuse
//     attack — revoke EVERY active refresh for that user.
//   - If revoked_at is set → reject (whether or not it expired).
//
// Mirrors AdminRefreshToken intentionally so verification logic can
// later be lifted into a shared module without per-entity branching.
@Entity('user_refresh_tokens')
export class UserRefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User

  @Index()
  @Column({ type: 'int', name: 'user_id' })
  user_id!: number

  // bcrypt hash of the token's `jti` claim.
  @Column({ type: 'varchar', length: 100, name: 'token_hash' })
  token_hash!: string

  @Index()
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expires_at!: Date

  @Column({ type: 'timestamptz', nullable: true, name: 'used_at' })
  used_at!: Date | null

  @Column({ type: 'timestamptz', nullable: true, name: 'revoked_at' })
  revoked_at!: Date | null

  @Column({ type: 'varchar', length: 45, nullable: true, name: 'ip_address' })
  ip_address!: string | null

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'user_agent' })
  user_agent!: string | null

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date
}
