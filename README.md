# Rent A Room

&copy; 2026 David Rakosa. All rights reserved.

Township room and backroom listing platform for Soweto and surrounds. Landlords list
a room after verifying their SA cell number with an SMS OTP; tenants browse, filter,
and contact landlords directly on WhatsApp.

## What's included

- **Express + MongoDB backend** — landlord OTP auth (JWT session cookie), listing
  CRUD, public browse/filter API, WhatsApp contact handoff, admin moderation queue.
- **Single-page frontend** (`public/index.html`) — listings grid with live filters,
  a "List Your Room" flow wired to the real OTP endpoints (not mock UI state).
- **Twilio Verify** driver for real SMS in production, **local mock driver** for dev
  (OTP is printed to the server console and returned in the API response as `devOtp`).
- **Cloudflare Turnstile** bot check on the OTP request endpoint, auto-skipped in dev.
- **Rate limiting** on both OTP request and verify endpoints, and on admin login.
- **Admin dashboard** (`/admin`) — login with your admin key, see live stats, approve
  or reject or edit or delete any listing, and block/unblock landlords.
- **Jest + Supertest** integration test suite (`tests/auth.test.js`).
- **Dockerfile** and **docker-compose.yml** for containerized local/prod runs.

## Admin access

Go to `/admin` on your deployed site (or `http://localhost:3000/admin` locally) and
sign in with the `ADMIN_KEY` from your `.env`. Only the admin key holder can delete or
modify listings and landlords — landlords themselves can only create listings, never
edit or delete anyone's (including their own) after submission. From there you get:

- **Stats** — active/pending/rejected/flagged listing counts, landlord counts (total
  and paid subscribers), total contact clicks.
- **Listings** — approve, reject, edit any field, delete outright, or filter to just
  flagged (possible scam) listings.
- **Landlords** — see every registered landlord, their trial/paid status, and
  block/unblock their account (a blocked landlord can no longer publish).
- **Bulk import** — paste a JSON array of listings you've personally reviewed
  (e.g. copied from a Facebook group post) and they go live immediately. See
  "About the daily Facebook scraping request" below for why this replaces
  automated scraping.

The admin session is a signed 12-hour cookie, so you only need to type the key once
per session. The `x-admin-key` header still works for direct API calls (e.g. scripts, curl).

## About the daily Facebook scraping request

I didn't build an automated scraper that pulls listings from Facebook (or anywhere
else) on a schedule. Two concrete reasons:

1. Facebook's Terms of Service explicitly prohibit automated scraping of their
   platform, including via bots or scripts that aren't their own API.
2. Rental listings usually include a real person's phone number and name. Pulling
   that off Facebook and republishing it on your site without that person's consent
   is a real privacy and legal exposure for you as the site operator, not just
   Facebook.

What's here instead is **bulk import** in the admin dashboard: you (or someone you
trust) copies a listing you've actually looked at, pastes it in, and it's live in
seconds — with your judgment in the loop instead of an unsupervised bot. It's
slower than scraping 20 listings a day automatically, but it's the version that
doesn't put you at legal risk or wreck trust when a landlord finds their number
published somewhere they never agreed to.

## Phone number consent and WhatsApp handling

Landlords choose, per listing session, whether their number is shown directly on
the public listing or kept behind a "Contact Landlord" click:

- **Default (no extra action needed)**: the number stays out of the public API
  response entirely. Tapping "Contact Landlord" opens a WhatsApp chat (or, if the
  landlord doesn't have WhatsApp on that number, a phone call) — the number is
  only ever transmitted to the browser as part of that one deep link, not sitting
  in the public feed.
- **Opt-in public number**: landlords can tick "Show my phone number directly on
  the listing," which requires a separate consent checkbox before it's accepted.
  The backend (`routes/auth.js`) rejects the request if `showPhonePublicly` is
  true but `consentPhonePublic` isn't — the two are never decoupled.
- **No WhatsApp handling**: if a landlord unchecks "This number has WhatsApp,"
  tenants see a "Call" button (`tel:` link) instead of a WhatsApp deep link, and
  landlords are warned about this while filling out the form.

## Free trial and billing

Every landlord gets a 90-day free trial from signup (`Landlord.trialEndsAt`). After
that, `POST /api/listings/create` returns `402 Payment Required` until an admin
marks them `isPaidSubscriber: true` from the dashboard's Landlords tab.

**This does not include real payment processing.** Wiring up an actual payment
gateway (PayFast, Yoco, and Paystack are the common choices for South African
rands) needs a merchant account you set up and choose yourself — I can build the
integration once you tell me which provider you want, but I'm not going to guess
your payment processor or fabricate credentials. For now, marking someone paid is
a manual admin action.

## Scam-safety signals

- **Auto-flagging on creation** (`services/scamDetection.js`) — new listings are
  scanned for common scam phrases (wire transfer requests, "pay before viewing",
  suspiciously low rent, a photo already used by a different landlord account) and
  flagged for admin review if any hit. This is heuristic, not a guarantee — it
  surfaces likely-risky listings into your review queue, it doesn't block them
  outright, since false positives are expected.
- **Public "Report this listing" button** on every card — any tenant can flag a
  listing as suspicious with one click, no login needed. Two reports or one
  keyword hit is enough to land a listing in the admin dashboard's flagged filter.
- **Admin review loop** — flagged listings show their specific reasons in the
  dashboard; you can clear the flag (also resets the report count) or delete
  outright.

## Fixes made while combining the pasted snippets

- `middleware/rateLimiters.js` was referenced but never defined — created it.
- Duplicated Express app setup between `server.js` and the test file (two different
  app instances, so cookies/sessions weren't actually shared in tests) — the test file
  now imports the real `server.js` app directly via `module.exports = app`.
- `JWT_SECRET` had a hardcoded fallback (`'dev_secret_key'`) that would silently run
  in production if the env var was missing — server now refuses to boot without a
  real secret.
- The static marketing page's "Publish Room" button only pushed into a local JS array
  and never called the backend — it's now wired through the real OTP → verify →
  create-listing flow.
- Landlord contact info was fully public in the old card markup — contact now goes
  through `/api/listings/:id/contact`, which returns a WhatsApp deep link instead of
  exposing the raw number in the public listings feed.
- Added input validation/length caps on listing creation, and a `trust proxy` setting
  so rate limiting and `req.ip` behave correctly behind Railway/Render/Vercel's proxy.
- Added a `pending_review → active/rejected` moderation gate (was defined in the schema
  but never enforced) so new listings don't appear publicly until approved.

## New features added

- **Public browse API** (`GET /api/listings`) with suburb/price/type filtering and
  pagination — previously the frontend had filters but no backend to query.
- **WhatsApp contact handoff** with a `contactCount` counter per listing.
- **Full admin control panel** at `/admin` — cookie-based login, live stats, edit/delete
  any listing, approve/reject, and block/unblock landlords. Backed by `routes/admin.js`,
  protected by `ADMIN_KEY`.
- **`/api/config`** endpoint so the frontend can pick up the Turnstile site key
  without it being hardcoded into the HTML.
- **Landlord "my listings"** endpoint (`GET /api/listings/mine`).

## Local setup

```bash
npm install
cp .env.example .env        # then edit JWT_SECRET, ADMIN_KEY, MONGODB_URI
npm run dev                 # nodemon, http://localhost:3000
```

With `SMS_DRIVER=local` (the default in `.env.example`), OTP codes are printed to the
server console and also returned in the API response, and shown in a dev toast in the
UI — no real SMS provider needed to develop or test the flow. Developer bypass code
`666666` also works, but only because the mock driver is only loaded when
`SMS_DRIVER=local` or `NODE_ENV=development` (see `services/otpService.js`).

## Testing

```bash
npm test
```

This uses `mongodb-memory-server`, which downloads a real `mongod` binary the first
time it runs. If you're running this in a network-restricted CI/sandbox, that download
needs `fastdl.mongodb.org` allowed — outside of that, `npm test` works standalone. I
verified the app's routes directly (server boot, health check, phone validation,
auth guard on listing creation) since this sandbox's network doesn't allow that
download; the full suite should be run in your own environment or CI before trusting
it as a merge gate.

## Frontend build (Tailwind CSS)

The frontend used to load Tailwind from `cdn.tailwindcss.com`, which is a JIT
compiler script meant for prototyping — it warns loudly in the browser console
about not being production-safe, ships far more CSS than needed, and adds a
runtime dependency on a third-party CDN just to render the page. That's been
replaced with a real compiled stylesheet:

```bash
npm run build:css     # one-off build, outputs public/css/style.css (~20KB, minified)
npm run watch:css      # rebuilds automatically while you edit the HTML/config
```

`tailwind.config.js` and `styles/input.css` are the source of truth now — if you
change the color palette or fonts, edit `tailwind.config.js` and rebuild.
`public/css/style.css` is a build artifact but is checked in so the app works
immediately even if you forget to run the build step once.

## Going live: full checklist

1. **Generate real secrets.**
   ```bash
   openssl rand -hex 32   # JWT_SECRET
   openssl rand -hex 24   # ADMIN_KEY
   ```
2. **Get Twilio Verify credentials** — Account SID, Auth Token, and a Verify
   Service SID from twilio.com. Optionally a Cloudflare Turnstile site/secret
   key pair for bot protection on the OTP endpoint.
3. **Provision MongoDB Atlas** — free M0 tier is enough to start. Get the
   `mongodb+srv://...` connection string (steps covered earlier in this thread).
4. **Set environment variables** on your hosting platform:
   `NODE_ENV=production`, `SMS_DRIVER=twilio`, `JWT_SECRET`, `ADMIN_KEY`,
   `MONGODB_URI`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_VERIFY_SERVICE_SID`, and optionally `TURNSTILE_SITE_KEY` /
   `TURNSTILE_SECRET_KEY`. Running production without `SMS_DRIVER=twilio` means
   OTPs are never actually sent — the server logs a warning on boot if you forget.
5. **Push the code to GitHub** (I don't have a connection to your GitHub account,
   so this needs to happen from your machine):
   ```bash
   cd rentaroom
   git init
   git add .
   git commit -m "Rent A Room: production-ready build"
   git branch -M main
   git remote add origin https://github.com/<your-username>/rentaroom.git
   git push -u origin main
   ```
6. **Deploy on Railway or Render** (both handle a persistent Node + MongoDB +
   cookie-session app well; Vercel/Netlify are built for static/serverless and
   are a worse fit here):
   - **If deploying from the `Dockerfile`**: nothing extra to configure — the
     multi-stage build already runs `npm run build:css` before the app starts,
     and devDependencies (including Tailwind) never ship in the final image.
   - **If deploying from `package.json` directly (no Docker)**: explicitly set
     the platform's **Build Command** to `npm install && npm run build:css` and
     the **Start Command** to `npm start`. Don't rely on auto-detection — some
     buildpacks skip the `build` script for Node apps unless you tell them to run it.
7. **Point the platform at your repo**, set the environment variables from
   step 4, and deploy. `server.js` already reads `PORT` from the platform's
   injected environment variable, so you don't need to hardcode it.
8. **Verify after deploy**: hit `/api/health` (should show `db: "UP"`), open
   `/` and confirm styling loads with no console warnings, and log into `/admin`
   with your `ADMIN_KEY`.

If you'd like, connecting a Railway or Render account here lets me drive the actual
deployment for you instead of just handing you these steps.

## API summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/request-otp` | Turnstile (prod) | Send OTP to a landlord's phone |
| POST | `/api/auth/verify-otp` | — | Verify OTP, issue session cookie |
| POST | `/api/auth/logout` | — | Clear session cookie |
| POST | `/api/listings/create` | session cookie | Create a listing (pending review) |
| GET | `/api/listings` | — | Browse active listings, with filters |
| GET | `/api/listings/mine` | session cookie | A landlord's own listings, any status |
| GET | `/api/listings/:id` | — | Single active listing |
| POST | `/api/listings/:id/contact` | — | Get a WhatsApp/call link to the landlord |
| POST | `/api/listings/:id/report` | — | Flag a listing as suspicious (public) |
| POST | `/api/admin/login` | — | Exchange admin key for a session cookie |
| POST | `/api/admin/logout` | — | Clear admin session |
| GET | `/api/admin/stats` | admin | Dashboard counts, including flagged/paid |
| GET | `/api/admin/listings` | admin | All listings, any status; `?flagged=true` for the scam queue |
| PATCH | `/api/admin/listings/:id` | admin | Edit any field, change status, or clear a flag |
| DELETE | `/api/admin/listings/:id` | admin | Delete a listing |
| POST | `/api/admin/listings/import` | admin | Bulk-add up to 50 manually reviewed listings |
| GET | `/api/admin/landlords` | admin | All landlords with listing counts and billing status |
| PATCH | `/api/admin/landlords/:id` | admin | Block/unblock or mark paid subscriber |
| GET | `/api/config` | — | Public frontend config (Turnstile key, dev mode) |
| GET | `/api/health` | — | Liveness + DB connection status |
