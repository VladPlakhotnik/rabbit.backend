# Admin Module

The admin module provides staff authentication and protected admin APIs for the `rabbit-admin` panel. It is separate from game-user OAuth flows in `modules/auth`.

## Responsibilities

- Email/password login for staff.
- Access JWT issuance.
- Refresh-token rotation through an HttpOnly cookie.
- Role-based access control.
- Account lockout after repeated failed login attempts.
- Per-IP throttling on login.
- Admin mutation audit interception.

## API Surface

| Method   | Path                  | Auth               | Description                                                                  |
| -------- | --------------------- | ------------------ | ---------------------------------------------------------------------------- |
| `POST`   | `/admin/auth/login`   | none, throttled    | Login with email and password. Returns access token and sets refresh cookie. |
| `POST`   | `/admin/auth/refresh` | refresh cookie     | Rotate refresh token and issue a new access token.                           |
| `POST`   | `/admin/auth/logout`  | refresh cookie     | Revoke refresh token and clear the cookie.                                   |
| `GET`    | `/me`                 | admin bearer token | Return the current admin profile.                                            |
| `GET`    | `/admin/analytics/investor` | `super_admin`, `admin`, `manager`, `viewer`, `investor` | Return investment analytics summary. |
| `POST`   | `/admin`              | `super_admin`      | Create a staff account.                                                      |
| `GET`    | `/admin`              | `super_admin`      | List staff accounts.                                                         |
| `GET`    | `/admin/:id`          | `super_admin`      | Read one staff account.                                                      |
| `PATCH`  | `/admin/:id`          | `super_admin`      | Update name, role, active status, or password.                               |
| `DELETE` | `/admin/:id`          | `super_admin`      | Delete a staff account and cascade sessions.                                 |

There is no public registration endpoint. The first `super_admin` is bootstrapped from environment variables when the admin table is empty.

## Required Environment

```env
ADMIN_JWT_ACCESS_SECRET=replace_me_64_random_bytes
ADMIN_JWT_REFRESH_SECRET=replace_me_different_64_random_bytes

ADMIN_INITIAL_EMAIL=you@example.com
ADMIN_INITIAL_PASSWORD=ChangeMeNow!2026
```

Remove `ADMIN_INITIAL_EMAIL` and `ADMIN_INITIAL_PASSWORD` after the first boot creates the initial `super_admin`.

Optional variables:

```env
BCRYPT_ROUNDS=12
ADMIN_ACCESS_TOKEN_TTL_SECONDS=900
ADMIN_REFRESH_TOKEN_TTL_SECONDS=604800
ADMIN_MAX_FAILED_LOGIN_ATTEMPTS=5
ADMIN_LOCKOUT_DURATION_MS=900000
ADMIN_REFRESH_COOKIE_NAME=admin_rt
```

## Security Model

| Layer            | Enforcement                                                      |
| ---------------- | ---------------------------------------------------------------- |
| Password hashing | bcrypt, configurable rounds, default 12                          |
| Password policy  | long mixed-case password with digit and symbol                   |
| Login throttle   | per-IP rate limit                                                |
| Account lockout  | repeated failures lock the account temporarily                   |
| Access token     | short-lived JWT                                                  |
| Refresh token    | hashed in DB and rotated on each refresh                         |
| Refresh cookie   | HttpOnly, Secure in production, SameSite strict, admin auth path |
| Reuse detection  | refresh-token replay revokes related sessions                    |
| Role checks      | `@AdminRoles()` plus guard-level checks                          |
| Self-protection  | admin cannot deactivate, demote, or delete self                  |

## Migrations

Admin tables are created by:

```text
src/migrations/1746100000-CreateAdminTables.sql
src/migrations/1746100000-CreateAdminTables.ts
```

The `investor` admin role is added by:

```text
src/migrations/1748200000-AddInvestorAdminRole.sql
src/migrations/1748200000-AddInvestorAdminRole.ts
```

Apply the SQL migration manually when the deployment environment does not run TypeORM migrations automatically.

## Operational Notes

- Keep admin secrets separate from game-user JWT secrets.
- Never expose refresh tokens to JavaScript.
- Keep login errors generic to avoid email enumeration.
- Use the audit interceptor for staff mutations that affect money, roles, users, or catalog data.

## Follow-ups

- TOTP 2FA fields exist but the full service and endpoints are not wired yet.
- Admin audit log should be expanded as the panel gains more mutation surfaces.
- Self-service password reset needs a dedicated token table and email integration.
- Session listing and "log out other devices" can build on the existing refresh-session data.
