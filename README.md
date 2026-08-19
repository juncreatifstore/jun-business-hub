# JUN Business Hub — v1 Production Ready

Internal operations platform + public website for **JUN CREATIF AND TRAVEL LLC** — https://www.juncreatif.org

Next.js 14 (App Router) · TypeScript strict · Tailwind · Prisma 6 (pg driver adapter, WASM engine) · PostgreSQL (Supabase) · Zod · Vercel.

---

## Architecture

```
app/            Routes: public site (/), /login (+/login/mfa), /app (staff hub),
                /client (portal), /verify/[id] (public), /api/* (files, PDFs, OAuth, webhooks)
components/     UI primitives + app components (Tiptap editor, forms, shell)
lib/            auth (revocable sessions), permissions (RBAC), sanitize (XSS),
                crypto (AES-256-GCM secrets), storage, sequence, hash, rate-limit,
                ai/tools (permission-checked), google/gmail, docusign
services/       Server actions per module + pdf/ (server PDF) + payments/provider
prisma/         schema.prisma · migrations/ (versioned) · seed.mjs (dev fixtures)
tests/          Vitest — pure unit tests, no DB required
```

Access model: 11 staff roles (SUPER_ADMIN → VIEWER) + isolated CLIENT portal role.
Every server action and API route re-checks permissions server-side
(`requirePermission` / `assertPermission` / `can`); the edge middleware is only a
first line of defense. Client-portal users are hard-scoped to their own
`ClientAccount.clientId` — cross-client access returns 403 (covered by tests
and verified end-to-end).

## Local Development

```bash
cp .env.example .env      # fill DATABASE_URL, DIRECT_URL, AUTH_SECRET at minimum
npm install
npx prisma generate
npx prisma migrate deploy # applies prisma/migrations (or `migrate dev` while iterating)
npm run db:seed           # fictitious dev data — see credentials below
npm run dev
```

Seeded logins (**DEV ONLY** — never run the seed against production):
staff `admin@juncreatif.org` / `ChangeMe123!` (override with `SEED_ADMIN_PASSWORD`),
portal `aline.portal@example.com` / `ChangeMe123!`.

### First SUPER_ADMIN in production (safe method)

Do **not** seed production. Instead, run once with the production `DATABASE_URL`:

```bash
SEED_ADMIN_PASSWORD="$(openssl rand -base64 18)" node scripts/create-admin.mjs admin@juncreatif.org "Prénom" "Nom"
```

The script only creates the account if no SUPER_ADMIN exists yet, prints the
generated password once, and never writes it anywhere. Sign in, enable MFA
immediately (Settings → Security), then change the password.

```bash
npm run test    # Vitest (39 tests): RBAC, XSS sanitization, crypto, SHA-256,
                # numbering formats, refund cap, installment math, payment validation
npm run build   # prisma generate && next build — must be green before any deploy
```

## Supabase

1. Create a project. **Storage → New bucket → `jun-files` → PRIVATE** (never public).
2. Copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the
   **service_role** key into `SUPABASE_SERVICE_ROLE_KEY` (server-only — never
   ship it with `NEXT_PUBLIC_`, never commit it).
3. Security stance: the app talks to Postgres exclusively from the server via
   Prisma with the service connection; the anon key grants nothing (no RLS
   policies expose tables, no client-side Supabase queries exist). Storage
   objects are private; access goes through short-lived signed URLs generated
   server-side, or the authenticated `/api/files/[id]` route which enforces
   RBAC, Vault permission and client-portal scoping, and audits every download.

## Database

```env
DATABASE_URL= # pooled (pgbouncer, port 6543) — runtime
DIRECT_URL=   # direct (port 5432) — migrations
```

## Prisma Migrations

Versioned migrations live in `prisma/migrations/` (initial:
`202608190001_initial/migration.sql`). Production workflow:

```bash
npx prisma migrate deploy   # never use `db push` against production
```

The client uses `engineType = "client"` (WASM query compiler) + the pg driver
adapter: **no native Prisma engine is downloaded at build or runtime** — ideal
for Vercel/CI. `prisma.config.ts` routes CLI migrations through the same adapter.

## Storage

Driver abstraction (`lib/storage.ts`): `STORAGE_DRIVER=SUPABASE` in production,
`LOCAL` for dev (`./storage-dev`, gitignored). All files are private; documents,
receipts, signed PDFs, Vault files never get permanent public URLs. 15 MB max,
MIME whitelist. Vault access is written to the audit log on every read.

## Authentication

`jose`-signed JWT in an httpOnly cookie (`jun_session`, 12 h) **backed by a
Session row**: a JWT is only accepted while its SHA-256 exists in the `Session`
table, so logout and "Revoke session" are real revocations. Passwords: bcrypt
cost 12. Login is rate-limited (10/min/IP).

## MFA

TOTP (otplib). Settings → Security → Enable MFA → QR → verify code →
8 single-use recovery codes (stored hashed, displayed exactly once). Secrets are
AES-256-GCM encrypted with a key derived from `AUTH_SECRET`. Login becomes
two-step (`/login/mfa`) once enabled. Recommended — and intended to become
mandatory — for SUPER_ADMIN, DIRECTOR, ADMIN, FINANCE, LEGAL, ACCOUNTANT.
Verified end-to-end (valid code → session; invalid → rejected; audit written).

## JUN AI

Vercel AI SDK (`ai` + `@ai-sdk/openai`). Set `OPENAI_API_KEY`
(optional `OPENAI_MODEL`, default gpt-4o-mini). Tools (`lib/ai/tools.ts`):
search/get for clients, cases, documents, payments, refunds +
`createDocumentDraft`, `createReceiptDraft`, `createTaskDraft` — **every tool
re-checks the current user's RBAC permission**, results are minimized (no full
documents, no secrets, no passport data). The AI only creates DRAFTS; sensitive
actions (send email, finalize, sign, approve payment/refund) require the
`AIAction` PROPOSED → APPROVED → EXECUTED human workflow. Without the key the
chat degrades gracefully to direct tool commands.

## Gmail

**READY — CREDENTIALS REQUIRED.** Real OAuth 2.0 + Gmail REST integration:
Settings → Email → Connect Gmail (SETTINGS_MANAGE only, signed anti-CSRF state),
refresh token stored encrypted server-side, automatic token refresh, folder sync
(Inbox/Sent/Drafts/Important, read/unread, auto-association to clients by email),
real send from `/app/mail`. AI triage levels enforced: **BLOCKED** topics
(refunds, legal, banking, high amounts) can never be auto-sent. Required:

```env
GOOGLE_CLIENT_ID=            # Google Cloud Console → OAuth client (Web)
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://www.juncreatif.org/api/google/oauth/callback
```

Works with existing Google Workspace boxes (contact@, finance@, contracts@,
support@, travel@juncreatif.org) — connect each one from Settings → Email.
Automatic *creation* of Workspace accounts is NOT implemented (Admin SDK not
configured — not simulated).

## DocuSign

**READY — CREDENTIALS REQUIRED.** Real provider behind the existing
`SignatureProvider` abstraction (MOCK stays dev-only). JWT grant auth, envelope
created with the exact final PDF, statuses via the secured webhook
`/api/webhooks/docusign` (HMAC-SHA256 of the raw body, constant-time compare —
the payload is never trusted unverified). On completion: signed PDF fetched and
stored, its SHA-256 recorded, request + document marked SIGNED with full audit
trail. Required:

```env
SIGNATURE_PROVIDER=DOCUSIGN
DOCUSIGN_CLIENT_ID= DOCUSIGN_USER_ID= DOCUSIGN_ACCOUNT_ID=
DOCUSIGN_BASE_PATH= DOCUSIGN_OAUTH_BASE= DOCUSIGN_PRIVATE_KEY= DOCUSIGN_WEBHOOK_SECRET=
```

One-time admin consent URL is documented in `lib/docusign.ts`.

## Environment Variables

See `.env.example` — every variable used by the code is listed there with
comments. `AUTH_SECRET` also derives the AES key for stored secrets: rotating it
invalidates sessions **and** requires reconnecting Gmail and re-enrolling MFA.

## Vercel Deployment

1. Push to GitHub (see below), import the repo in Vercel. Framework: **Next.js**,
   production branch: **main**. Build command is already `prisma generate && next build`.
2. Add the environment variables from `.env.example`
   (`STORAGE_DRIVER=SUPABASE`, pooled `DATABASE_URL`, `DIRECT_URL`, strong `AUTH_SECRET`…).
3. Run migrations once against production: `npx prisma migrate deploy`
   (locally with the prod `DIRECT_URL`, or as a CI step).
4. Deploy. If the build fails: read the log, fix locally, `npm run build`, push, redeploy.

## Domain

Vercel → Settings → Domains: add `www.juncreatif.org` (primary) and
`juncreatif.org` with **Redirect to www** (the app also 308-redirects apex → www
as a safety net). **DNS caution:** before touching records, inventory existing
MX/SPF/DKIM/DMARC — Google Workspace mail depends on them; only add/modify the
A/CNAME entries Vercel asks for, never wipe the zone.

## Security

Server-side RBAC everywhere · revocable sessions · MFA TOTP + hashed recovery
codes · strict server-side HTML sanitization (whitelist; script/iframe/object/
embed/event-handlers/javascript: stripped; tested) · CSP, HSTS (prod),
X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy · rate
limiting (MEMORY default, UPSTASH provider ready) on login, MFA, AI, Gmail sync
· IDOR guards on every `[id]` surface (files, PDFs, notifications, AI
conversations, portal) · append-only audit log for login, MFA, downloads, Vault
access, payments, refunds, signatures, mailbox events, AI executions · secrets
at rest encrypted AES-256-GCM · no secret is committed (scan before every push).

## Feature status (real, verified in QA)

| Area | Status |
|---|---|
| Auth / RBAC / revocable sessions | WORKING (e2e tested) |
| MFA TOTP + recovery codes | WORKING (e2e tested) |
| CRM · Cases · Tasks · Drive · Vault · Finance · Audit · Search · Portal | WORKING |
| Documents: Tiptap · sanitization · versioning · SHA-256 · server PDF · QR verify | WORKING (PDF + verify e2e tested) |
| JUN AI (Vercel AI SDK, permission-checked tools, human approval) | WORKING — model needs `OPENAI_API_KEY` |
| Gmail (OAuth, sync, real send, triage) | READY — CREDENTIALS REQUIRED |
| DocuSign (JWT grant, envelope, HMAC webhook, signed PDF) | READY — CREDENTIALS REQUIRED (sandbox test pending) |
| Payments STRIPE/PAYPAL/MERCADO_PAGO | NOT IMPLEMENTED (MANUAL provider is the active, working mode) |

Production guarantees: mock email send and mock signing are hard-disabled when
`NODE_ENV=production` (server-side guards, not just hidden buttons); nothing is
ever recorded as SENT/SIGNED unless the real provider accepted it.

## Backup

Supabase runs daily automatic backups (check your plan's retention). Additionally:
scheduled `pg_dump` via the direct URL for off-site copies, and the private
`jun-files` bucket should be replicated (Supabase Storage has no PITR). Restore
drill: new project → `psql < dump` → repoint `DATABASE_URL`/`DIRECT_URL`.

## Troubleshooting

- **Build fails on fonts** — fonts load at runtime via `<link>` (`optimizeFonts:false`); no network needed at build.
- **`migrate deploy` engine download errors in CI** — the schema engine can run as WASM through `prisma.config.ts`; ensure `DIRECT_URL` is set.
- **401/403 on `/api/files/...`** — expected: authentication + RBAC + portal scoping; check the user's role and file ownership.
- **PDF shows 409 “integrity verification”** — the stored final PDF no longer matches its recorded SHA-256; treat as tampering, check the audit log.
- **Gmail “reconnect the mailbox”** — refresh token revoked or `AUTH_SECRET` rotated; reconnect from Settings → Email.
- **DocuSign webhook 401** — `DOCUSIGN_WEBHOOK_SECRET` must match the HMAC key configured in DocuSign Connect.
