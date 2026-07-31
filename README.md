# Veerha WMS — Warehouse Management System

A full-stack, multi-tenant Warehouse Management System (npm workspaces monorepo).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 10, TypeScript, raw `pg` (no ORM), custom SQL migrations, Socket.IO |
| Frontend | React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, React Query |
| Super Admin | React 18, Vite, TypeScript (separate console for platform operators) |
| Shared | `@veerha/shared-types` — TypeScript types shared by backend and frontend |
| Database | PostgreSQL 16 |
| Auth | JWT (access + refresh tokens), bcrypt |
| Deployment | Render (backend, Docker), Cloudflare Pages (frontend + super-admin) via GitHub Actions |

## Monorepo Layout

```
veerha-wms/
├── apps/
│   ├── backend/         # NestJS API (@veerha/backend) — modules under src/modules/,
│   │   │                #   SQL migrations under src/database/migrations/
│   │   └── Dockerfile   # Production image used by Render
│   ├── frontend/        # Main React SPA (@veerha-wms/frontend) — admin & manager UI
│   └── super-admin/     # Platform operator console (@veerha/super-admin)
├── packages/
│   └── shared-types/    # @veerha/shared-types — build before typechecking apps
├── docker-compose.yml   # Local Postgres 16 + Adminer
└── render.yaml          # Render blueprint for the backend service
```

## Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL), or a native PostgreSQL 16 install

## Quickstart

```bash
# 1. Start PostgreSQL (user veerha / veerha123, db veerha_wms_dev) + Adminer
docker compose up -d postgres

# 2. Configure the backend
cp apps/backend/.env.example apps/backend/.env
# For the Docker DB set:
# DATABASE_URL=postgresql://veerha:veerha123@localhost:5432/veerha_wms_dev

# 3. Install dependencies (root — installs all workspaces)
npm install --legacy-peer-deps

# 4. Build shared types (required before frontend/backend typecheck or build)
npm run build:types

# 5. Run database migrations
npm run migrate

# 6. Start the backend (port 3000)
npm run dev:backend

# 7. In another terminal, start the frontend (port 8080)
npm run dev

# Optional: super-admin console (port 8090)
npm run dev --workspace=apps/super-admin
```

> `--legacy-peer-deps` is required because the backend mixes NestJS 10 core with
> NestJS 11 peer-dependent packages (`@nestjs/swagger@11`, `@nestjs/jwt@11`, ...).

## Root npm Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Frontend dev server (port 8080) |
| `npm run dev:backend` | Backend dev server with watch (port 3000) |
| `npm run migrate` | Run backend SQL migrations |
| `npm run build:types` | Build `@veerha/shared-types` |
| `npm run build` / `build:backend` / `build:all` | Build frontend / backend / everything |
| `npm run lint` | Lint the frontend |
| `npm run test:frontend` / `test:backend` | Vitest / Jest |

## Ports

| Service | Port |
|---------|------|
| Backend API (NestJS) | 3000 |
| Frontend (Vite) | 8080 |
| Super Admin (Vite) | 8090 |
| PostgreSQL | 5432 |
| Adminer (DB UI) | 8070 |

## Environment Variables

### Backend (`apps/backend/.env`, see `.env.example`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | API port (default 3000) |
| `NODE_ENV` | `development` / `production` |
| `CORS_ORIGIN` | Comma-separated allowed origins |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing secrets (`openssl rand -base64 64`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email. Empty `SMTP_HOST` makes EmailService a no-op (log-only) — safe for dev |
| `APP_URL` | Public frontend URL used in email links |

### Frontend (`apps/frontend`)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend API base URL |
| `VITE_API_MODE` | `real` to hit the API (set in CI/deploy) |
| `VITE_SENTRY_DSN` | Optional Sentry error reporting |

### Super Admin (`apps/super-admin`)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend API base URL |

## CI / Deployment

- **CI** (`.github/workflows/ci.yml`): on every PR and push to `main` — lint,
  typecheck, test, and build for all three apps (shared-types built first).
- **Deploy** (`.github/workflows/deploy.yml`): on push to `main` —
  - Backend: Render deploy hook (Docker build from `apps/backend/Dockerfile`, blueprint in `render.yaml`, health check at `/health`).
  - Frontend → Cloudflare Pages project `app-veerha`; Super Admin → project `veerha-admin`.
- **Required GitHub secrets**: `RENDER_SERVICE_ID`, `RENDER_API_KEY`,
  `VITE_API_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Render dashboard env vars (marked `sync: false` in `render.yaml`):
  `DATABASE_URL`, `CORS_ORIGIN`, `APP_URL`, and the `SMTP_*` set.

## Roadmap

See [PLAN.md](PLAN.md) for the current audit and completion plan (admin & manager flows).
