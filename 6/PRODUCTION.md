# Lucky Six Dice Jackpot - Production Readiness

## Current Deployment Shape

This repository is a Vite React frontend plus a Node/Express backend.

- Frontend: Vercel-compatible static Vite build.
- Backend: Node/Express runtime using local SQLite through `better-sqlite3`.
- Database target: Neon PostgreSQL schema is prepared in `neon/schema.sql`, but the runtime data adapter still needs migration from SQLite to PostgreSQL before Neon can be the live production database.

## Vercel Frontend

Use these Vercel settings:

- Framework Preset: `Vite`
- Install Command: `npm install`
- Build Command: `npm run build -w client`
- Output Directory: `client/dist`

Required Vercel frontend variable when the API is not hosted on the same origin:

```text
VITE_API_BASE=https://your-api-host.example.com
```

If you later move the API behind the same Vercel domain, keep `VITE_API_BASE` empty.

## Backend Environment

Required for production:

```text
NODE_ENV=production
SESSION_SECRET=<strong random secret>
ADMIN_USER=admin
ADMIN_PASSWORD=<strong admin password>
CORS_ORIGIN=https://your-vercel-app.vercel.app
PUBLIC_KIOSK_URL=https://your-vercel-app.vercel.app
```

Current local SQLite backend:

```text
DATABASE_PATH=server/data/lucky-six.db
```

Future Neon backend:

```text
DATABASE_URL=postgresql://...
```

## Neon Preparation

Run `neon/schema.sql` in Neon to create the required tables.

Important: the current backend still uses synchronous SQLite APIs. Before using Neon as the live production database, migrate `server/src/db.ts` to a PostgreSQL adapter using `DATABASE_URL`.

## Production Security Notes

- `ADMIN_PASSWORD` and `SESSION_SECRET` are mandatory when `NODE_ENV=production`.
- `.env*`, SQLite files, backups, `node_modules`, and build output are ignored by Git.
- `/api/play` ignores `playerId` submitted by the browser and uses the active server-side player.
- CORS is only open in development. In production, set `CORS_ORIGIN`.

## Local Verification

```bash
npm install
npm run lint
npm run typecheck
npm run build
npm run dev
```
