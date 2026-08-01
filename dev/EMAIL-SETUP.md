# Email setup

Everything the backend mails, how to see it locally, and how to turn it on in
production with Resend.

The whole integration is plain SMTP — five environment variables. There is no
provider SDK in the codebase and no code change is needed to switch providers.

Code: `apps/backend/src/modules/email/email.service.ts` (transport + helpers),
`apps/backend/src/modules/email/templates.ts` (HTML),
`apps/backend/src/modules/notifications/notification-jobs.service.ts` (queue workers).

---

## 1. What the system sends, and when

### Account emails — always sent, no Settings toggle

These are transactional and fire directly from the request that caused them.
All three are fire-and-forget (`.catch(() => undefined)` at the call site), so a
send failure never rolls back the user-facing action — it only shows up in the
API logs.

| Email | Subject | Trigger |
|---|---|---|
| Welcome | `Welcome to Veerha WMS — get started` | `POST /api/v1/auth/signup` — new tenant owner signs up (`auth.service.ts:48`) |
| Invite | `You've been invited to Veerha WMS as {role}` | `POST /api/v1/users`, `/users/invite`, `/users/invite/bulk` — admin adds a user (`users.service.ts:97`). Contains the temporary password |
| Password reset | `Your Veerha WMS password has been reset` | `POST /api/v1/users/:id/reset-password` — admin resets someone's password (`users.service.ts:246`). Contains the new temporary password |

### Notification emails — gated by Settings → Notifications

Business events go through `NotificationsService.emit()`. Each event maps to an
*alert type* with two independent tenant switches in
**Settings → Notifications**: `enabled` (create the in-app notification at all)
and `email_enabled` (also queue an email). **If `email_enabled` is off, nothing
is queued and no email is ever sent for that alert type** — the in-app bell still
works. Events without a `settingsKey` (e.g. `task.assigned`, `po.approved`)
create in-app notifications but **never** email.

Rows land in the `notification_email_queue` table and are drained by three cron
jobs, each guarded by a Postgres advisory lock so only one instance runs a tick:

| Email | Subject | Job / cadence |
|---|---|---|
| Single alert | `[Veerha] {notification title}` | `flushImmediateEmails` — every 10 minutes, drains `priority='immediate'` rows |
| Hourly digest | `[Veerha] N alerts in the last hour` | `flushBatchedEmailDigest` — hourly, groups every `priority='batched'` row per recipient into ONE email |
| Daily summary | see the note below | `sendDailySummaries` — 18:00 daily, emits `system.daily_summary` per tenant that has the alert type enabled |

Priority is a property of the event, not a setting. Critical and
approval-blocking events are `immediate` (zero stock, QC failure, batch expiring
in ≤7 days, adjustment/transfer approval pending, courier booking failed,
worker-reported issue, e-commerce sync failure). Informational ones are
`batched` (low stock, expiry "soon", GRN created, pick list completed, shipment
delivered, daily summary). See `notification-events.ts`.

Alert types that ship with **email ON by default**: Low Stock, Expiry, Task
Exceptions, Adjustment Approval Pending, Transfer Approval Pending, Daily
Summary. Everything else defaults to in-app only. Per-tenant rows in
`tenant_notification_settings` override these defaults.

> **Known wart — the daily summary renders as a digest.** `system.daily_summary`
> is a `batched` event, so its queue row is delivered by the hourly digest job
> and arrives as *"[Veerha] 1 alert in the last hour"* with a one-line body.
> The purpose-built `dailySummaryEmail()` template (the four-stat card:
> orders shipped / GRNs received / approvals pending / SKUs low) renders
> correctly but has **no production caller**. Same for
> `approvalRequestEmail()` — approvals ride the notification queue instead.
> Wiring the digest job to render the daily-summary template for
> `event_type = 'system.daily_summary'` is a change in
> `notification-jobs.service.ts`, not in the email module.

### Volume reality check

The batching rules keep the count low. A busy single-warehouse tenant with the
default toggles produces roughly:

- 1 hourly digest per manager during working hours → ~10–12/day per recipient
- a handful of immediate alerts (zero stock, failed QC, approvals) → ~5–15/day
- 1 daily summary
- the occasional invite or password reset

That is **a few dozen emails a day**, so Resend's free 3,000/month is genuinely
enough for the first customers. **100/day is the ceiling to watch**: it is a
per-account limit, and it is reached by 3–4 active tenants, or sooner if several
of them switch on the noisier alert types (GRN created, pick list completed, QC
pending) or add many recipients — every recipient is a separate email.

---

## 2. Local development — Mailpit

Mailpit is an SMTP server that captures everything and forwards nothing. No
account, no credentials, no risk of mailing a real customer.

```bash
# from the repo root
docker compose up -d mailpit

# web UI (and REST API) — every captured email, with the rendered HTML
open http://localhost:8025
```

Point the backend at it in `apps/backend/.env`:

```bash
SMTP_HOST=localhost      # use `mailpit` if the API also runs in docker compose
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=               # empty — Mailpit takes no credentials, AUTH is skipped
SMTP_PASS=
SMTP_FROM="Veerha WMS (dev) <noreply@veerha.local>"
APP_URL=http://localhost:8080
```

Restart the API. The boot log must say:

```
EmailService initialised — localhost:1025 secure=false auth=none from="..."
SMTP ready: localhost:1025 (secure=false) as anonymous
```

Trigger real emails: sign up a tenant (welcome), invite a user (invite), reset a
password (reset). For the notification emails, queue a row and let the job drain
it — the immediate flush runs every 10 minutes:

```sql
INSERT INTO notification_email_queue
  (tenant_id, user_id, to_email, event_type, subject, payload, priority)
VALUES ('<tenant-uuid>', '<user-uuid>', 'you@example.com',
        'inventory.zero_stock', '[Veerha] Zero stock: SKU-9001',
        '{"title":"Zero stock: SKU-9001","body":"0 units available.",
          "linkPath":"/inventory/stock?sku=SKU-9001","severity":"critical",
          "recipientName":"Priya"}'::jsonb,
        'immediate');   -- use 'batched' (several rows) to exercise the digest
```

Scripted assertions can use Mailpit's REST API instead of the UI:

```bash
curl -s http://localhost:8025/api/v1/messages | jq '.messages[] | {Subject, To}'
curl -s http://localhost:8025/api/v1/message/<ID> | jq -r .HTML | grep 'View in Veerha'
curl -sX DELETE http://localhost:8025/api/v1/messages     # clear the mailbox
```

Every notification email carries one **View in Veerha** button built as
`${APP_URL}${link_path}`. If those links come out wrong, `APP_URL` is wrong —
the templates do not hardcode a host.

---

## 3. Production — Resend

Resend speaks standard SMTP, so switching to it is configuration only; the
service's transport options already express every setting it needs (verified
against the live server on ports 465, 587 and 2587).

### Step 1 — account
Sign up at <https://resend.com>. The free plan needs no card.

### Step 2 — add and verify a sending domain
**Domains → Add Domain** → e.g. `veerha.com` (a subdomain such as
`mail.veerha.com` is fine and keeps your main domain's reputation separate).
Resend shows the DNS records to publish at your registrar / Cloudflare:

| Type | Purpose | Notes |
|---|---|---|
| `TXT` (SPF) | authorises Resend's servers to send as your domain | `v=spf1 include:amazonses.com ~all` — merge with an existing SPF record, never publish two |
| `TXT` (DKIM) | cryptographic signature proving the mail was not tampered with | Resend gives the exact host + value; copy verbatim |
| `MX` | bounce/feedback handling for the sending subdomain | only on the subdomain Resend names |
| `TXT` (DMARC) | tells receivers what to do when SPF/DKIM fail, and where to send reports | start at `v=DMARC1; p=none; rua=mailto:dmarc@veerha.com`, tighten to `p=quarantine` once reports are clean |

Wait for the domain to show **Verified** (usually minutes; DNS TTL can make it
an hour). **Skipping SPF/DKIM is the difference between the inbox and the spam
folder** — Gmail and Outlook both require authenticated mail from bulk senders,
and unauthenticated mail from a new domain is filtered aggressively or rejected
outright. DMARC is what stops someone else spoofing invoices from your domain,
and it is what gives you visibility when delivery breaks.

### Step 3 — create an API key
**API Keys → Create API Key**, sending permission, copy the `re_…` value. It is
shown once. This string is the SMTP *password*.

### Step 4 — set the env vars in Render

Render dashboard → the service → **Environment**. Both `veerha-wms-backend` and
`veerha-wms-backend-staging` already declare these keys as `sync: false` in
`render.yaml`, so they are filled in per service:

| Variable | Value |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `465` (or `587` / `2587` for STARTTLS) |
| `SMTP_SECURE` | `true` for 465, `false` for 587/2587 |
| `SMTP_USER` | `resend` — the literal word, **not** your email address |
| `SMTP_PASS` | the `re_…` API key |
| `SMTP_FROM` | `Veerha WMS <noreply@veerha.in>` — the domain **must** be the verified one |
| `APP_URL` | public frontend URL, e.g. `https://app-veerha.pages.dev` — every link in every email is built from it |

Save; Render redeploys. Confirm in the deploy log:

```
EmailService initialised — smtp.resend.com:465 secure=true auth=resend from="Veerha WMS <noreply@veerha.in>"
SMTP ready: smtp.resend.com:465 (secure=true) as resend
```

Use a **separate API key for staging**, ideally on a `staging.` subdomain, so a
staging leak cannot touch production sending.

### Free-tier limits — read this before testing

- **3,000 emails per month** and **100 per day**, counted per Resend *account*
  (not per domain, not per service). Staging and production share the quota if
  they share the account.
- **Until a domain is verified you can only send to the email address that owns
  the Resend account.** Every other recipient is rejected with a 4xx/5xx at
  send time. This is the single most confusing thing about testing Resend: the
  credentials are correct, the boot log says `SMTP ready`, and mail to a
  colleague still never arrives. The failure lands in
  `notification_email_queue.last_error` for queued mail, and in the API log for
  welcome/invite/reset mail.
- The shared `onboarding@resend.dev` sender works without any domain setup, but
  **only to your own account address** — fine for a smoke test, useless for a
  real customer.
- Exceeding 100/day does not queue at Resend; sends are rejected until the
  window resets. The queue rows retry (3 attempts, 10 minutes apart) and then
  park as `failed`.

---

## 4. Troubleshooting

**Nothing arrives at all, and the logs show nothing.**
`SMTP_HOST` is unset. `EmailService` then runs in NO-OP mode: every send is
logged and dropped, and — importantly — queue rows are still marked `sent`, so
the queue table looks healthy. Look for this line at boot:

```
SMTP_HOST not configured — EmailService running in NO-OP mode ...
```

and for `[NO-OP EMAIL — SMTP_HOST unset, nothing was delivered]` per send.

**Authentication failures.** The startup `transporter.verify()` catches these
before any user is affected:

```
SMTP VERIFY FAILED for smtp.resend.com:465 (secure=false) as resend — Invalid login: 535 ...
```

The app still boots — mail being down is not a reason for the warehouse to stop —
but every send will fail until it is fixed. Common causes:

- `SMTP_USER` set to an email address instead of the literal `resend`
- `SMTP_PASS` holding an old/revoked key, or a key with whitespace pasted in
- `SMTP_SECURE=false` on port 465 (or `true` on 587) — a TLS mismatch usually
  presents as a hang or `wrong version number`. Leaving `SMTP_SECURE` empty is
  safe: it is derived from the port.
- host unreachable → `getaddrinfo ENOTFOUND` (typo, or the mail catcher is not
  running / not on the same docker network)

**Some emails arrive, others do not.** Check the alert type's `email_enabled`
toggle in Settings → Notifications, and remember `batched` alerts only leave on
the hourly job. Then inspect the queue:

```sql
-- what is stuck, and why
SELECT id, to_email, subject, priority, status, attempts,
       left(last_error, 200) AS last_error, scheduled_for, sent_at, created_at
  FROM notification_email_queue
 WHERE status <> 'sent'
 ORDER BY created_at DESC
 LIMIT 50;

-- failure summary for one tenant
SELECT status, count(*), max(created_at)
  FROM notification_email_queue
 WHERE tenant_id = '<tenant-uuid>'
 GROUP BY status;

-- most common errors
SELECT left(last_error, 120) AS err, count(*)
  FROM notification_email_queue
 WHERE last_error IS NOT NULL
 GROUP BY 1 ORDER BY 2 DESC;
```

`attempts` increments on every try. A row that fails is rescheduled 10 minutes
out and retried **at most 3 times**, then parked as `status='failed'` — it is
never retried again, so a permanently bad address or a revoked key cannot loop
forever (`notifications.repository.ts` → `markEmailFailed`). `sent`/`failed`
rows older than 30 days are deleted by the nightly retention purge.

To retry parked rows after fixing the cause:

```sql
UPDATE notification_email_queue
   SET status = 'pending', attempts = 0, last_error = NULL, scheduled_for = NOW()
 WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 day';
```

**Nothing is being queued at all.** The cron jobs are disabled when
`ENABLE_SCHEDULED_JOBS=false`; the boot log says so explicitly. Note the jobs
take a Postgres advisory lock, so with multiple instances exactly one runs each
tick — that is by design, not a stuck job.

**Links in emails point at the wrong host.** Set `APP_URL` to the public
frontend origin, with no trailing slash. `link_path` values are stored relative.

**Mail arrives but lands in spam.** SPF/DKIM/DMARC are missing or the `From`
domain does not match the verified domain. Check the received message's
`Authentication-Results` header for `spf=pass` and `dkim=pass`.
