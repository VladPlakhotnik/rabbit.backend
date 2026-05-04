# Admin module — staff auth for the rabbit-admin panel

Self-contained NestJS module providing email + password login, JWT
access tokens, refresh-token rotation, role-based access, account
lockout, and per-IP rate limiting for the admin panel staff. **Not**
the same flow as game-user OAuth (`modules/auth/`) — different table,
different secrets, different lifecycle.

## API surface

| Method   | Path                  | Auth                    | What it does |
|----------|-----------------------|-------------------------|--------------|
| `POST`   | `/admin/auth/login`   | none + IP throttle 5/60s | Email + password → access token (body) + refresh cookie |
| `POST`   | `/admin/auth/refresh` | refresh cookie          | Rotate refresh, issue new access |
| `POST`   | `/admin/auth/logout`  | refresh cookie          | Revoke refresh + clear cookie |
| `GET`    | `/me`                 | Bearer access           | Current admin's profile |
| `POST`   | `/admin`              | super_admin             | Create new staff member |
| `GET`    | `/admin`              | super_admin             | List all staff |
| `GET`    | `/admin/:id`          | super_admin             | One staff member |
| `PATCH`  | `/admin/:id`          | super_admin             | Update name / role / active / password |
| `DELETE` | `/admin/:id`          | super_admin             | Hard delete (cascades sessions) |

There is **no public `/register` endpoint** by design. The first
super_admin is bootstrapped via env vars (one-shot, see below).
After that, super_admin creates everyone else from the panel.

## Setup checklist

### 1. Install npm deps

```bash
cd rabbit.backend
yarn add @nestjs/jwt @nestjs/passport passport-jwt @nestjs/throttler bcrypt cookie-parser
yarn add -D @types/passport-jwt @types/bcrypt @types/cookie-parser
```

### 2. Set env vars

```env
# Required — separate secrets for access vs refresh JWT family
ADMIN_JWT_ACCESS_SECRET=<openssl rand -base64 64>
ADMIN_JWT_REFRESH_SECRET=<openssl rand -base64 64>

# One-shot bootstrap — creates the very first super_admin if the
# table is empty. Remove these env vars after the first successful
# boot. Password must satisfy the policy (12+ chars, mixed case +
# digit + symbol).
ADMIN_INITIAL_EMAIL=you@example.com
ADMIN_INITIAL_PASSWORD=ChangeMeNow!2026

# Optional — defaults are sensible.
# BCRYPT_ROUNDS=12
# ADMIN_ACCESS_TOKEN_TTL_SECONDS=900            # 15 min
# ADMIN_REFRESH_TOKEN_TTL_SECONDS=604800        # 7 days
# ADMIN_MAX_FAILED_LOGIN_ATTEMPTS=5
# ADMIN_LOCKOUT_DURATION_MS=900000              # 15 min
# ADMIN_REFRESH_COOKIE_NAME=admin_rt
```

### 3. Apply the migration

Either via TypeORM CLI:

```bash
yarn typeorm migration:run -d ./src/datasource.ts
```

Or paste `src/migrations/1746100000-CreateAdminTables.sql` into psql /
pgAdmin / your DB GUI.

### 4. Wire the module

In `src/app.module.ts`, add to the `imports` array:

```ts
import { AdminModule } from './modules/admin/admin.module'

@Module({
  imports: [
    // ...existing modules...
    AdminModule,
  ],
})
```

In `src/main.ts`, before `app.listen(...)`:

```ts
import cookieParser from 'cookie-parser'

app.use(cookieParser())
```

### 5. First boot

1. Start the backend (`yarn start:dev`).
2. AdminAuthService.onModuleInit() detects the empty admins table and
   creates a super_admin from `ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD`.
3. **Remove those two env vars from your config** so they can't be
   used again accidentally.
4. Log in via the admin panel. Use that account to create other
   staff via `POST /admin`.

## Security model — what's enforced and why

| Layer | Enforcement | Why |
|-------|-------------|-----|
| Passwords | bcrypt cost 12 | OWASP-recommended baseline (~250ms / hash on modern CPUs) |
| Password policy | 12+ chars, lower + upper + digit + symbol | OWASP ASVS L2 |
| Login throttle | 5 attempts / 60s / IP | Slows distributed brute force |
| Account lockout | 5 fails → 15 min lock | Stops single-IP brute force; counter resets on success |
| Email enumeration | Same error + bcrypt-burn on missing user | No timing oracle |
| Access JWT | 15 min TTL | Limits theft window |
| Refresh JWT | 7 days TTL, hashed in DB, single-use rotation | Token theft detectable + invalidatable |
| Refresh storage | HttpOnly + Secure + SameSite=Strict + path=/admin/auth | XSS can't read; cross-site can't send; only refresh endpoints get it |
| Refresh reuse detection | Old token re-presented → revoke ALL sessions | If two parties hold the same token, one is the attacker |
| Role check | Per-endpoint via `@AdminRoles()` + `AdminRolesGuard` | Defense in depth — also re-checks current `is_active` |
| Self-protection | Can't deactivate / demote / delete self | Locks out can't recover |
| 2FA | Schema-ready (`totp_secret`, `totp_enabled`) | Enable later without migration |

## Known follow-ups (not in v1)

- **2FA (TOTP)** — fields exist; service / endpoints not wired yet.
- **Audit log** — login / logout / role changes etc. should land in a
  separate `admin_audit_log` table for forensics.
- **Password reset by email** — currently password is changed via
  `PATCH /admin/:id` by super_admin. Self-service reset needs a
  separate `password_reset_token` table + email integration.
- **Session listing / kill** — UI for "current sessions" / "log out
  other devices" — service has `revokeAllForAdmin()` ready.
