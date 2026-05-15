import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator'
import { AdminSecurityEventType } from '../entities/admin-security-event.entity'

export const ADMIN_SECURITY_EVENT_TYPES: AdminSecurityEventType[] = [
  'login_success',
  'login_failed',
  'login_blocked',
  'account_locked',
  'password_changed',
  'password_change_failed',
  'totp_setup_started',
  'totp_setup_failed',
  'totp_enabled',
  'totp_disable_failed',
  'totp_disabled',
  'session_revoked',
  'sessions_revoked',
  'refresh_reuse_detected',
]

export class AdminSecurityEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25

  @IsOptional()
  @IsIn(ADMIN_SECURITY_EVENT_TYPES)
  type?: AdminSecurityEventType

  @IsOptional()
  @IsUUID()
  admin_id?: string

  @IsOptional()
  @IsString()
  search?: string
}

export class AdminAuditLogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50
}

