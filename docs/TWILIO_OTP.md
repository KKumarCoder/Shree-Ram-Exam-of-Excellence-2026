# Twilio Verify integration and release guide

## Existing architecture and audit

This repository uses JavaScript ES modules: React 18/Vite (client, port 5173), Express/Mongoose (server, port 5000 by default), MongoDB, JWT draft/student tokens, and role-protected admin cookies. Vite proxies `/api` locally. PM2 uses one forked server process; the repository includes a Hostinger/Nginx example, not evidence of a live deployment.

`Registration` already represents a draft (`APP-...`). Guardian verification advances it to `OTP_VERIFIED`; manual receipt review or captured Razorpay payment remains necessary for confirmation. The atomic `Counter` and confirmation claim preserve `SHREE26-000001` numbering. PDFKit admit cards, private student photos/receipts, administrator reports/search, and email/generic confirmation SMS remain in place. There are no registered parent accounts or subject-choice fields to replace.

The working tree already contained Twilio SDK/service, Challenge model, notification, registration UI, and status UI edits. This implementation builds on those changes. Audit gaps addressed: process-local rate limits, simultaneous resend/verify races, replay/phone context binding, expiring verification authorization, draft idempotency, in-place mobile edit, unsafe example credentials, origin scheme matching, and safe provider failures. No live production system was modified.

## Files

- `server/src/services/twilioOTP.js`: official SDK, E.164 normalization, bounded timeout, safe error mapping, startup service check.
- `server/src/services/registrationOTP.js`: persistent challenges, shared cooldown, verification attempts, one-time approval, context isolation.
- `server/src/services/otpSecurity.js`: MongoDB limits and leases, safe abuse events, expiry checks.
- `server/src/utils/mobile.js`, `validation.js`, `origin.js`: normalization/input validation and exact origin scheme.
- `server/src/models/index.js`: expiry fields, idempotency index, challenge metadata, rate buckets and leases.
- `server/src/routes/public.js`: existing OTP routes, resend alias, mobile edit, atomic draft creation, expiring authorization, serialized payment initiation.
- `server/src/services/notifications.js`: delegates OTP to Verify while retaining confirmation notifications.
- `server/src/index.js`: validated configuration, shared HTTP limits, index initialization, service identity check.
- `client/src/App.jsx`, `client/src/Register.jsx`, `client/src/api.js`: accessible OTP UI, cooldown, mobile editing, duplicate-submit guard, expired-session recovery.
- `server/tests/otp.test.js`, `server/tests/integration/otp.test.js`, `server/tests/origin.test.js`: unit, MongoDB/HTTP concurrency, payment/admit-card regression checks.
- `server/package.json` and existing lockfile: Twilio dependency and integration-test command.
- `.env.example`, README, API and production checklist documentation. Local `.env` additions preserve existing values and remain ignored by Git.

`client/src/Status.jsx` also has pre-existing uncommitted changes; these are preserved.

## Configuration

Set these **only in `server/.env`** or the backend host's secret store. Never use `VITE_` for secrets.

| Variable | Default / required | Purpose |
|---|---|---|
| `SMS_PROVIDER` | `twilio` required | OTP provider |
| `OTP_DELIVERY_MODE` | `sms` required | Real SMS only; no OTP development bypass |
| `TWILIO_ACCOUNT_SID` | Required `AC` SID | Existing account |
| `TWILIO_AUTH_TOKEN` | Required private token | Backend SDK authentication |
| `TWILIO_VERIFY_SERVICE_SID` | Required `VA` SID | Existing **Shree Ram Public School** service |
| `OTP_PEPPER` | Required, 32+ random characters | HMAC of rate-limit/lock identifiers; retained existing secret |
| `OTP_RESEND_COOLDOWN_SECONDS` | 45; range 30–300 | Shared phone cooldown, including uncertain provider failures |
| `OTP_CHALLENGE_TTL_SECONDS` | 600 | Local challenge window, not a change to Twilio token expiry |
| `OTP_AUTHORIZATION_TTL_SECONDS` | 1800 | Time after successful verification to initiate payment |
| `OTP_MAX_VERIFICATION_ATTEMPTS` | 5; range 1–10 | Attempts per active challenge, retained on resend |
| `OTP_MOBILE_HOURLY_LIMIT` | 5 | SMS requests per normalized mobile |
| `OTP_DRAFT_HOURLY_LIMIT` | 5 | SMS requests per application |
| `OTP_GLOBAL_HOURLY_LIMIT` | 100 | Overall SMS request cap; tune conservatively for launch |
| `OTP_IP_LIMIT` | 30 | Combined sensitive HTTP requests/IP/15 minutes |
| `TRUST_PROXY_HOPS` | 0 locally | Set to **1** only behind the provided single Nginx proxy; prevent direct backend access |

Existing MongoDB, JWT, email, school, payment and URL settings remain required as before. Drafts expire after three hours. Existing paid/pending-payment registrations are not deleted or invalidated by draft expiry. All new numeric OTP settings must be positive integers; TTLs are bounded to 86400 seconds. Public API requests also have a shared 120/IP/15-minute limit. Fixed windows can allow a burst across a window boundary; Fraud Guard and the global cap remain additional controls.

Startup validates SID/token formats, connects MongoDB, waits for security indexes, then performs a read-only Verify Service fetch. It requires the exact service friendly name `Shree Ram Public School` and `codeLength=6`. It never creates or modifies a Twilio account/service. A Twilio outage during this startup check prevents startup; monitor this dependency and stage restarts.

**Expiry:** Twilio documents a default of 10 minutes, configurable via Support. The Service resource does not expose the effective customized token validity. Confirm your actual setting in Twilio Console/Support before launch and align the local challenge window. Resend does not extend the local active challenge window or reset its attempt count. This implementation does not claim your service has a particular expiry. See [Twilio timeouts](https://www.twilio.com/docs/verify/api/rate-limits-and-timeouts) and [Service settings](https://www.twilio.com/docs/verify/api/service).

## Install and run locally

Node.js >=20 and MongoDB are required. Preserve your existing `.env`; copy the example only for a fresh checkout.

```bash
npm install
npm run install:all
# Configure server/.env, then run in separate terminals:
npm run dev --prefix server
npm run dev --prefix client
# Or start both:
npm run dev
```

Vite: `http://localhost:5173`; API: `http://localhost:5000/api`. Configure real school details and open registration through the existing admin settings. `npm run seed:admin` is available for initial setup; do not reseed a live administrator unintentionally.

The current local Account SID failed format validation during implementation. Replace invalid/placeholder Twilio values privately in `.env`. No real SMS was sent, and neither live service identity nor effective expiry has been verified.

## MongoDB deployment/migration

No replica set or Redis is required for the OTP module. Atomic single-document updates, unique indexes and persistent leases operate on standalone MongoDB or Atlas. All instances must use the same database and `OTP_PEPPER`.

Startup initializes the Registration sparse unique `draftRequestKey` index, Challenge expiry/context indexes, and new `otpbuckets`/`otplocks` collections with TTL indexes. Existing documents need no destructive migration. MongoDB TTL cleanup is asynchronous; every authorization/lease check also enforces expiry explicitly. Challenges are retained for up to an hour after expiry; registration records are not TTL-deleted. Existing legacy `OTP_VERIFIED` drafts without authorization expiry require verification again; existing payment/confirmed records continue normally. Back up first and validate index creation on staging if the production database disables automatic indexing.

No OTP code is stored. Only Twilio reference/status and timestamps are recorded. A challenge is consumed before draft approval; if the process dies between these operations, it fails closed and the applicant requests another code. Leases recover after 60 seconds; SDK requests time out after 12 seconds. Pending sessions for the same phone cannot transfer across drafts/purposes. Families should finish one child's OTP before starting another child's verification.

## API contract

Existing paths are retained:

- `POST /api/registrations/start`: validates student/guardian data; creates a draft. The UI sends a random `Idempotency-Key` UUID; identical concurrent/retried requests return the same draft. Reusing the key with different data returns 409. Legacy callers without a key remain supported but should add one for retry safety.
- `POST /api/registrations/otp/send` and `/resend`: same authenticated implementation; safe accepted-request message, `resendAvailableAt`, `cooldownSeconds`, `expiresAt`. A pending result does not establish delivery.
- `POST /api/registrations/otp/verify`: draft bearer token and `{ "otp": "<six digits>" }`; binds to stored mobile and provider reference. Never accepts a client verification flag.
- `PATCH /api/registrations/mobile`: draft bearer token and `{ "guardianPhone": "<Indian mobile>" }`; only before payment initiation, resets authorization and invalidates pending challenges.
- `GET /api/registrations/me`: draft state and cooldown metadata; expired verification returns to the OTP step.
- Existing `/api/status/request` and `/verify` reuse the same secure service with distinct `lookup` purpose and scoped JWTs.

Errors retain `{ "error": "safe message" }`. Authentication expiry is 401; invalid/expired code is 400; conflicting in-flight/context requests are 409; expired draft is 410; rate/cooldown is 429; provider unavailable is 502/503. Editing a phone during payment is prohibited. OTP proves phone possession, not identity, guardianship, payment, or school approval.

## Automated tests

```bash
npm test
npm run build
```

Verified during implementation: **16 unit/validation tests and 23 MongoDB/HTTP integration tests passed**, frontend build passed, and `git diff --check` passed. The first sandboxed database test attempt could not connect to localhost; the rerun with local-network permission passed all tests. No lint script exists in this repository. The build has an existing large JavaScript chunk warning.

Database/HTTP tests require an **isolated local database**. The test suite refuses remote/application database URLs and clears only collections in `shree_otp_test`:

```bash
mkdir -p /tmp/shree-otp-test-db
mongod --dbpath /tmp/shree-otp-test-db --port 27029 --bind_ip 127.0.0.1
# Another terminal:
OTP_TEST_MONGODB_URI=mongodb://127.0.0.1:27029/shree_otp_test npm run test:integration --prefix server
```

Twilio is mocked only inside automated tests. Tests exercise real MongoDB atomic operations and Express HTTP routes, including duplicate draft creation/finalization and payment-gated PDF generation. They do not prove live SMS delivery, live Razorpay settlement or browser/device behavior.

## Manual real SMS test

1. Fill valid credentials privately; select the existing Shree Ram Public School service with exact friendly name and six-digit codes. Confirm actual token expiry, SMS channel, Fraud Guard, India geo permissions and the permitted trial recipient with Twilio.
2. Start the API; the read-only startup check must succeed. Use an isolated staging database and school-approved test registration settings.
3. Enter all required student/guardian details using your Twilio-approved recipient. Request OTP once; confirm actual handset arrival. Do not copy codes into logs or screenshots. A successful API response alone is not a delivery test.
4. Try one incorrect code, then the received code. Confirm verified state. Repeat in separate controlled trials for expiry, cooldown, resend, reload and editing the number; changing it must require fresh verification.
5. Reuse the old verify request/token after success; it must fail. Try a second draft's token; it must not authorize that draft. Submit rapidly from two tabs; one action succeeds and the other is rejected or returns the same idempotent draft.
6. Confirm payment is still required and admit-card download is denied before approval. Use an authorized real payment test; verify registration number and PDF after the existing school/payment process approves it.
7. Test keyboard Enter, pasted code, autofill, narrow-screen layout and error announcements in the supported browsers.

## Production activation and deployment

- Keep the trial account restrictions. Only eligible/verified recipients can be tested; do not promise arbitrary student delivery. Preserve Twilio's trial/SAMPLE TEST marker. See [Twilio Verify prerequisites](https://www.twilio.com/docs/verify/api/verification).
- Obtain owner approval before upgrading or activating paid services. Confirm India SMS routes, geo permissions and applicable sender/template/DLT or other compliance requirements **with Twilio** for this account and Verify product. Fraud Guard must remain enabled.
- Confirm service identity, code length, effective expiry, provider budget alerts and conservative rate caps. Decide public-launch bot protection based on load and abuse monitoring.
- Use HTTPS and the exact frontend origin. Set `PUBLIC_BASE_URL` to the real HTTPS portal; preserve JWT/admin cookie protections. Set `TRUST_PROXY_HOPS=1` for the repository's one-proxy Nginx topology and firewall the API port.
- Replace the credential-like values formerly present in `.env.example` if they were ever reused as real secrets/passwords. They have been removed from the example, but Git history cannot be assumed clean.
- Back up MongoDB and private uploads. Keep files private; use shared private storage before scaling the app beyond the existing single instance.
- Test in staging; no paid services or live deployment were activated here.

The checked-in `ecosystem.config.cjs` runs `src/index.js` from `./server` on port 5000. `docs/hostinger-nginx.conf.example` serves `client/dist` and proxies `/api` to localhost:5000. Its domain/path are **examples**; confirm actual hosting before applying them.

For an approved deployment: install dependencies, run tests, build the client, supply server secrets, verify MongoDB indexes and Twilio startup check, then deploy the built client and restart the existing PM2 process with `pm2 restart shree-olympiad-api --update-env`. Use `pm2 start ecosystem.config.cjs` only for a first deployment. Validate Nginx configuration before reloading, install/renew TLS, test `/api/health`, then run the controlled live registration test. Preserve existing payment webhooks and school-site routing. Roll back source/build together if checks fail; new optional MongoDB fields can remain. Never expose `.env` or `private-uploads` through Nginx.

Registration recheck: the automated manual-payment flow now covers form submission, mocked Twilio verification, required photo upload, receipt submission, duplicate receipt protection, authenticated school approval, registration numbering and PDF download. The frontend distinguishes an unavailable backend from closed registration and recovers from expired verification sessions. Live SMS and payment-provider delivery remain unverified.
