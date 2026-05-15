# Bunny Backend

Bunny Backend is the NestJS API for the Bunny gaming platform. It powers authentication, users, inventory, cases, game modes, giveaways, live feeds, notifications, payments, and integrations with Steam, Telegram, market APIs, Redis, Postgres, Fly.io, and the admin panel.

## Stack

- NestJS 10
- TypeScript
- TypeORM
- PostgreSQL
- Redis / ioredis
- Socket.IO
- Passport/JWT
- Nest Scheduler
- Fly.io deployment

## Main Modules

- `auth` - Steam, Google, Telegram, JWT access/refresh flows.
- `users` - user profile, balance, linked social accounts, Steam data refresh, subscription bonuses.
- `userInventory` - user-owned skins and inventory mutations.
- `cases`, `skinCase`, `skins`, `sections` - case catalog and skin data.
- `liveDrops` - global live drop feed and bot-generated case drops.
- `mines` - Mines sessions, moves, cashout, history, and live feed.
- `crash`, `crashLive`, `crashAutoBets` - Crash sessions, live state, and auto-bet storage.
- `clicker*` - clicker state, boosts, cases, levels, challenges, history, and Redis-backed engine state.
- `upgrade` - skin upgrade game.
- `giveaways` - active giveaways, participation, completion, winner history.
- `partners` - partner profile, levels, and earnings.
- `notifications` - user notifications and socket delivery.
- `withdraw`, `payments`, `promoCodes`, `rewards` - finance and reward flows.
- `admin` - separate staff auth and admin API.
- `bots` - reusable bot personality/profile data for simulated activity.
- `core/audit`, `core/idempotency`, `core/presence`, `core/redis`, `core/database` - shared infrastructure.

## Requirements

- Node.js 20 or newer for Docker/Fly runtime. Local development also works with newer Node versions used by the workspace.
- Yarn 1.x.
- PostgreSQL.
- Redis.

## Environment

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.

Important variables:

```env
PORT=5000
BASE_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

DATABASE_URL=postgres://user:password@host:5432/dbname
REDIS_URL=redis://localhost:6379

JWT_ACCESS_SECRET=replace_me
JWT_REFRESH_SECRET=replace_me_different_value

STEAM_API_KEY=replace_me
TELEGRAM_BOT_TOKEN=replace_me
TELEGRAM_CHANNEL_CHAT_ID=replace_me
STRIPE_SECRET_KEY=replace_me

MARKET_CSGO_API_KEY=replace_me
MARKET_DOTA2_API_KEY=replace_me
```

Admin-specific variables are documented in [src/modules/admin/README.md](./src/modules/admin/README.md).

## Local Development

```bash
yarn install
yarn dev
```

The API runs on `http://localhost:5000` unless `PORT` is set.

Run Redis with Docker if you do not have it installed locally:

```bash
docker compose up redis
```

Run the backend through Docker:

```bash
docker compose up backend
```

## Scripts

```bash
yarn dev                       # Start Nest in watch mode
yarn build                     # Build to dist/
yarn start                     # Run dist/main.js
yarn lint:check                # ESLint check
yarn lint                      # ESLint with fixes
yarn format                    # Prettier write for src/test
yarn sync:csgo                 # One-off CS2 price sync
yarn sync:dota                 # One-off Dota price sync
yarn sync:csgo:catalog         # One-off CS2 catalog sync
yarn sync:dota:catalog         # One-off Dota catalog sync
yarn clicker:redis:clear       # Clear clicker Redis state
yarn clicker:load              # Clicker websocket load smoke
yarn clicker:security:smoke    # Clicker security smoke script
```

## Database

SQL and TypeORM migrations live in `src/migrations/`. Some legacy SQL files also live in `migrations/`.

Recommended workflow:

1. Create a SQL migration for schema or seed changes.
2. Add a matching TypeORM migration when runtime migration support is needed.
3. Keep migration names timestamped and descriptive.
4. Do not commit database dumps. `*.dump` is ignored.

## Realtime and Redis

Redis is used for:

- live drop feeds;
- mines and crash live feeds;
- clicker engine/cache state;
- Telegram replay protection;
- socket fan-out and lightweight presence support.

When Redis is unavailable, some modules degrade poorly by design because they protect game consistency. Check backend logs first if live feeds or clicker state stop updating.

## Deployment

Production deployment is configured for Fly.io:

- app: `bunny-backend`
- region: `ams`
- internal port: `5000`
- runtime command: `node --max-old-space-size=192 dist/main.js`
- deployment config: [fly.toml](./fly.toml)

The `prod` branch is the deployment branch for this repository.

Useful Fly commands:

```bash
fly status -a bunny-backend
fly releases -a bunny-backend
fly logs -a bunny-backend
fly checks list -a bunny-backend
```

## Security Notes

- Do not commit `.env`, logs, database dumps, or generated `dist/`.
- Keep access and refresh JWT secrets different.
- Use `CORS_ORIGINS` explicitly in production.
- Prefer idempotency helpers for balance/inventory mutations.
- Keep user-facing social link flows tied to the authenticated Bunny user, never to a user id supplied by the request body.

## Documentation

- Admin module: [src/modules/admin/README.md](./src/modules/admin/README.md)
- Environment reference: [.env.example](./.env.example)
- Deployment reference: [fly.toml](./fly.toml)
