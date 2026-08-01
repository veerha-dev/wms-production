# Veerha WMS — Deployment Runbook

Everything you need to ship a change: what the environments are, what has to be
configured before staging works, how a release flows, and how to get back if it
goes wrong.

> **Two things are true right now and both bite silently.**
>
> 1. **SMTP is not configured.** `SMTP_HOST` is empty on the production Render
>    service, and `EmailService` degrades to a no-op when it is. Every
>    notification email — password resets, approval requests, the hourly digest,
>    the daily summary — is **silently dropped**. Nothing errors, nothing is
>    queued for later, nothing tells the user. Until real SMTP credentials are
>    set, treat "the user will get an email" as false everywhere in the product.
> 2. **`CORS_ORIGIN` is `*` in production.** `main.ts` treats `*` as allow-all,
>    so any origin on the internet can call the API with a stolen token. It
>    should be pinned to the real frontend origins (see
>    [Environment variables](#environment-variables)).

---

## 1. Environments

| | Local | Staging | Production |
|---|---|---|---|
| **Frontend** | `http://localhost:8080` (`npm run dev`) | `https://staging.app-veerha.pages.dev` | `https://app-veerha.pages.dev` |
| **Super Admin** | `http://localhost:8090` (`npm run dev --workspace=apps/super-admin`) | `https://staging.veerha-admin.pages.dev` | `https://veerha-admin.pages.dev` |
| **Backend API** | `http://localhost:3000` (`npm run dev:backend`) | `https://veerha-wms-backend-staging.onrender.com` | `https://veerha-wms-backend.onrender.com` |
| **Database** | Postgres 16 in Docker (`docker compose up -d postgres`), `veerha_wms_dev`, adminer on `:8070` | Neon branch **`staging`** (branched from `main`) | Neon branch **`main`** |
| **Deployed by** | you, by hand | push to `staging` → `.github/workflows/deploy-staging.yml` | push to `main` → `.github/workflows/deploy.yml` |
| **Render service** | — | `veerha-wms-backend-staging` | `veerha-wms-backend` |
| **Pages branch** | — | `staging` | `main` |
| **Data** | throwaway | **treat as throwaway** — it is a Neon branch and gets reset | real customer data |

The exact Pages hostnames depend on the branch alias Cloudflare assigns. After
the first staging deploy, read the real URLs out of the workflow log (wrangler
prints them) and confirm they match what you put in `CORS_ORIGIN` / `APP_URL` /
`VITE_API_URL_STAGING`.

Both backends run the **same image from the same Dockerfile** with
`NODE_ENV=production`. Staging is isolated by having its own database and its
own JWT secrets, not by running in a different mode — that is deliberate, so
staging exercises the production code paths (API docs off by default, production
error handling, production CORS behaviour).

---

## 2. GitHub secrets

Set these in **Settings → Secrets and variables → Actions**. `deploy.yml`
(production) and `deploy-staging.yml` share the Render API key and the
Cloudflare credentials; everything else is per-environment.

| Secret | Used by | What it is | Example |
|---|---|---|---|
| `RENDER_API_KEY` | both deploy workflows | Render account API key, used to POST a deploy. Render dashboard → Account Settings → API Keys. | `rnd_xxxxxxxxxxxxxxxxxxxx` |
| `RENDER_SERVICE_ID` | `deploy.yml` | Service id of **`veerha-wms-backend`**. It is the `srv-…` in the service's dashboard URL. | `srv-abc123def456` |
| `RENDER_STAGING_SERVICE_ID` | `deploy-staging.yml` | Service id of **`veerha-wms-backend-staging`**. Getting this wrong deploys staging code to production — check it twice. | `srv-xyz789ghi012` |
| `CLOUDFLARE_API_TOKEN` | both deploy workflows | API token with the **Cloudflare Pages: Edit** permission for the account. | `abcdef…` |
| `CLOUDFLARE_ACCOUNT_ID` | both deploy workflows | Cloudflare account id (dashboard sidebar / URL). | `0123456789abcdef0123456789abcdef` |
| `VITE_API_URL` | `deploy.yml` | Production API origin baked into the production frontend and super-admin bundles at build time. **No trailing slash.** | `https://veerha-wms-backend.onrender.com` |
| `VITE_API_URL_STAGING` | `deploy-staging.yml` | Staging API origin, baked into the staging bundles. **No trailing slash.** | `https://veerha-wms-backend-staging.onrender.com` |

`VITE_*` values are compile-time substitutions, not runtime config — change one
and you must rebuild and redeploy the frontend for it to take effect.

`VITE_API_MODE` is set to `real` inline in both workflows and is not a secret.
When it is anything else the frontend runs against `src/mocks` and never touches
the API — which looks like a working deploy but is not one.

---

## 3. Environment variables (Render)

Set on each backend service under **Environment**. `render.yaml` declares them;
anything marked `sync: false` there is *not* in git and must be filled in by
hand the first time.

| Variable | Prod value | Staging value | Why |
|---|---|---|---|
| `DATABASE_URL` | Neon `main` branch pooled connection string | Neon **`staging`** branch pooled connection string | Must contain `sslmode=require` or a `neon.tech` host — `migrate.ts` only enables SSL when it sees one of those, and Neon refuses plaintext. |
| `NODE_ENV` | `production` | `production` | Turns off Swagger/ReDoc and switches to production error handling. |
| `PORT` | `3000` | `3000` | Matches `EXPOSE 3000` and the Dockerfile healthcheck. |
| `JWT_SECRET` | auto-generated by Render | auto-generated by Render, **different value** | Signs access tokens and authenticates the websocket handshake. A shared secret would make a staging token valid in production. |
| `JWT_REFRESH_SECRET` | auto-generated by Render | auto-generated by Render, **different value** | Signs refresh tokens. |
| `CORS_ORIGIN` | **currently `*` — pin it** to `https://app-veerha.pages.dev,https://veerha-admin.pages.dev` | `https://staging.app-veerha.pages.dev,https://staging.veerha-admin.pages.dev` | Comma-separated allowlist. `main.ts` treats a list containing `*` as allow-all. Requests with no `Origin` header (curl, server-to-server) are always allowed. |
| `APP_URL` | `https://app-veerha.pages.dev` | `https://staging.app-veerha.pages.dev` | Base URL for links inside emails. Wrong here = emails that link to the wrong environment. |
| `ENABLE_API_DOCS` | unset (docs off) | `true` | Re-exposes `/api/docs` and `/api/redoc` on staging for manual testing. Leave it off in production — it publishes the full route and DTO map. |
| `ENABLE_SCHEDULED_JOBS` | unset (= true) | unset (= true) | In-process crons: email flush, hourly digest, daily summary, retention purge, putaway-overdue scan, batch-expiry scan. Each takes a Postgres advisory lock, so extra instances are safe. Set `false` only to silence them. |
| `SMTP_HOST` | **empty today → email is a silent no-op** | empty, or a capture service (Mailtrap/Mailpit) | The single switch that turns email on. Everything below is ignored while it is empty. |
| `SMTP_PORT` | `587` | `2525` (Mailtrap) | |
| `SMTP_SECURE` | `false` for 587/STARTTLS, `true` for 465 | `false` | |
| `SMTP_USER` | mailbox / API user | capture-service user | |
| `SMTP_PASS` | mailbox / API password | capture-service password | Never commit this. |
| `SMTP_FROM` | `"Veerha WMS <noreply@veerha.com>"` | `"Veerha WMS (staging) <noreply@staging.veerha.com>"` | A distinct staging From makes stray mail obvious. |

**Never point staging at the production database or the production SMTP
account.** Staging exists so a destructive bug is survivable; both of those
undo that.

---

## 4. First-time staging setup

Do these in order. Steps 1–3 must be finished before the first push to
`staging`, or the deploy will build fine and then fail at boot.

**1. Create the Neon `staging` branch.**

- Neon console → your project → **Branches** → **New branch**
- Parent: `main`. Name: `staging`. Include data: yes — a copy-on-write branch is
  effectively free and gives you realistic data to test against.
- Open the new branch → **Connection details** → copy the **pooled** connection
  string. It looks like
  `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.
- If the copy contains real customer data, scrub or anonymise PII before letting
  anyone outside the team near the staging URL.

**2. Create the Render staging service.**

- Render dashboard → **New** → **Blueprint** → point it at this repo. Render
  reads `render.yaml` and offers both services; create
  `veerha-wms-backend-staging`.
  (Or: New → Web Service → Docker → repo, branch `staging`, Dockerfile
  `apps/backend/Dockerfile`, context `.`, health check `/health`.)
- When prompted, paste the Neon **staging** connection string into
  `DATABASE_URL`.
- Fill in the remaining `sync: false` variables from the table above. `CORS_ORIGIN`
  and `APP_URL` can be placeholders for now — you will not know the real Pages
  URLs until step 4.
- Confirm `JWT_SECRET` / `JWT_REFRESH_SECRET` were generated and differ from
  production's.
- Copy the `srv-…` id out of the browser URL.

**3. Add the GitHub secrets.**

`RENDER_STAGING_SERVICE_ID` (from step 2) and `VITE_API_URL_STAGING`
(`https://veerha-wms-backend-staging.onrender.com`). `RENDER_API_KEY`,
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` already exist for production
and are reused.

**4. Create the `staging` branch and deploy.**

```bash
git checkout main && git pull
git checkout -b staging
git push -u origin staging
```

The push triggers `deploy-staging.yml`: Render builds the backend (running
migrations on boot), and wrangler publishes both Pages projects with
`--branch=staging`. Read the two Pages URLs out of the workflow log.

**5. Close the loop on the URLs.**

Set `CORS_ORIGIN` and `APP_URL` on the Render staging service to the real Pages
URLs from step 4, then redeploy the backend (Render dashboard → Manual Deploy,
or re-run the workflow). Until this is right the frontend loads but every API
call fails CORS.

**6. Protect the branch.**

Settings → Branches: require a PR and a passing CI run into `staging` and
`main`. Note that `ci.yml` currently only triggers on `pull_request` and on
push to `main` — a *direct* push to `staging` deploys without any CI gate. Either
always merge via PR, or add `staging` to the push branch list in `ci.yml`.

**7. Sanity check.** Run the [post-deploy checklist](#7-post-deploy-verification)
against the staging URLs.

---

## 5. Release procedure

```
feature branch ──PR──> staging ──(verify)──> PR ──> main
```

1. **Merge the feature PR into `staging`.** CI runs on the PR;
   `deploy-staging.yml` runs on the merge.
2. **Watch the deploy.** GitHub Actions → the staging run. The Render step only
   *triggers* a build — the build itself is in the Render dashboard, and that is
   where migration output shows up.
3. **Verify on staging** using the checklist in §7. Exercise the specific thing
   the change touched, and at least one thing it did not.
4. **Open a PR from `staging` to `main`**, get it reviewed, merge. That runs
   `deploy.yml` and ships to production.
5. **Re-run the checklist against production.**

### Migrations

The container's `CMD` is `node dist/database/migrate.js && node dist/main`, so
**migrations run automatically on every boot**, before the server accepts
traffic. `migrate.ts` records each applied file in a `_migrations` table and
skips anything already there, so re-deploying the same commit is a no-op. A
failed migration aborts the boot and Render's health check keeps the old
instance serving.

Migrations are **additive-only**: new tables, new nullable columns, new indexes —
never a drop or a destructive rewrite. That is the property that makes a code
rollback safe. Old code simply ignores the new columns.

Keep it that way. If a change genuinely needs to remove a column, do it as an
expand/contract across two releases (stop writing it, ship, verify, drop it in a
later release), never in the same deploy as the code that stops using it.

A migration that needs `CREATE INDEX CONCURRENTLY` (or anything else that cannot
run in a transaction) must start with `-- no-transaction` on its first line.

---

## 6. Rollback

### Code

Fastest and least surprising: **redeploy the previous good build**.

- Render dashboard → the service → **Deploys** → find the last green deploy →
  **Rollback to this deploy**. This reuses the already-built image, so it is a
  restart rather than a rebuild.
- Cloudflare Pages → the project → **Deployments** → the previous production
  deployment → **Rollback**. Do both, or the frontend and API will disagree
  about which contract they speak.

Via git, if you prefer the history to tell the truth:

```bash
git revert <bad-merge-sha> -m 1
git push origin main          # re-triggers deploy.yml
```

Because migrations are additive-only, rolling the code back **does not** require
rolling the database back — the extra tables and columns sit unused.

### Database

Only needed if a release corrupted or deleted data (a bad backfill, a bad bulk
import), which is exactly what a code rollback cannot fix.

Neon keeps a point-in-time history (retention depends on your plan — check it
*before* you need it).

1. **Do not delete anything.** Create a branch from the past instead:
   Neon console → **Branches** → **New branch** → *Create from* **a point in
   time**, and pick a timestamp a minute or two before the bad deploy. Name it
   something like `restore-2026-08-01`.
2. **Verify the restored branch** — connect with `psql` and confirm the rows you
   expect are there and the damage is not.
3. **Cut over** by pointing `DATABASE_URL` on the Render service at the restored
   branch's connection string and redeploying. This is faster and far more
   reversible than restoring into the live branch, and it leaves the damaged
   branch intact for forensics.
4. **Any writes that happened after the restore point are lost.** Say so
   explicitly to whoever owns the data before you cut over, and note the window.
5. Once the restored branch is the live one, promote/rename it so `main` means
   what it says again, and delete the damaged branch only after you are sure.

Rehearse this on staging at least once. A restore procedure you have never run
is not a restore procedure.

---

## 7. Post-deploy verification

Run against the environment you just deployed. Substitute the staging or
production host.

**On a free Render instance the first request after ~15 minutes idle takes about
30 seconds to cold start.** Give the health check one retry before you call it a
failed deploy.

1. **Health endpoint**

   ```bash
   curl -i https://veerha-wms-backend-staging.onrender.com/health
   # HTTP/1.1 200 OK
   # {"status":"ok","timestamp":"..."}
   ```

2. **Migrations applied** — Render dashboard → Logs. You should see the
   `🔄 Running database migrations...` block, then either applied files or
   `⏭️ Skipping` lines, then `🚀 Backend running on…`. Any migration error means
   the deploy is not live, whatever the dashboard says.

3. **Login works end to end** — open the frontend URL, sign in, land on the
   dashboard. This is the single best smoke test: it proves the bundle got the
   right `VITE_API_URL`, that CORS lets the browser through, and that
   `JWT_SECRET` is set.

   If login fails, open devtools → Network. A CORS error means `CORS_ORIGIN`
   does not list this exact origin. A request going to `localhost:3000` means
   the bundle was built without `VITE_API_URL`.

4. **One CRUD round trip** — Customers is the cheapest: create a customer with a
   valid B2B GSTIN (e.g. `33ABCDE1234F1Z5`), confirm State auto-fills to Tamil
   Nadu, save, see it in the list, edit it, and confirm the change persists
   after a hard reload. That covers the write path, the read path, tenant
   scoping and the DB connection.

5. **Websocket connects** — with the app open, devtools → Network → WS. There
   should be a socket.io connection to `<API_URL>/inventory` in state 101 that
   stays open. It carries live inventory updates *and* notifications. If it
   connects and immediately drops, the token is being rejected — check
   `JWT_SECRET`.

6. **Error rate** — watch Render logs for a few minutes of real traffic. No
   repeating stack traces, no `getaddrinfo`/`ECONNREFUSED` (database), no
   `Not allowed by CORS`. The frontend also reports to Sentry when
   `VITE_SENTRY_DSN` is set — check for a spike of new issues.

7. **Super Admin** — load the super-admin URL and confirm it authenticates
   against `/api/v1/sa`. It is built from the same `VITE_API_URL_STAGING` secret,
   so it fails in the same ways as the main frontend.

8. **Email** — if and only if `SMTP_HOST` is set: trigger something that notifies
   (an approval request) and confirm the message lands in the capture inbox.
   **If `SMTP_HOST` is empty this silently does nothing** — do not tick this box
   as "passed" because nothing errored.

---

## 8. Known gaps

- **SMTP unconfigured in production.** All notification email is silently
  dropped. There is no queue and no retry — messages generated while SMTP is
  unset are gone, not pending.
- **`CORS_ORIGIN=*` in production.** Should be pinned to the two Pages origins
  plus any custom domain.
- **`ci.yml` does not run on pushes to `staging`.** A direct push deploys with no
  test gate; merge via PR, or add `staging` to the push trigger.
- **Both Render services are on `plan: free`** — they sleep when idle and have no
  persistent disk. Fine for staging, and the reason production has a cold-start
  penalty after quiet periods.
- **No staging DNS.** Environments are identified by `*.pages.dev` /
  `*.onrender.com` hostnames, so an operator can be one bookmark away from doing
  something on the wrong environment. Distinct browser profiles help.
