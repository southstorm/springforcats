# Spring for Cats

For a no-install design demo, open **OPEN-PREVIEW.html** in your browser. It includes a browser-only admin demonstration with sample stock and orders. No real emails or orders are sent.

A feline-care storefront and owner dashboard. Node.js 24 provides a persistent SQLite backend; Vite builds the vanilla JavaScript frontend. No payment processor is connected.

## Development

Requires Node.js 24 (uses `node:sqlite`) and npm.

```sh
cd /workspace/springforcats
npm ci --cache /workspace/.npm-cache
npm run dev -- --port 5173
```

This starts the API on port 3001 and Vite on 5173 with same-origin API/upload proxying. Set `API_PORT` if 3001 is occupied. Cloud tasks are already isolated; use this checkout rather than creating a worktree unless requested.

### Create the real owner login

Run `npm run admin:create` in an interactive terminal. Enter the owner email and a password of 12–128 characters at the hidden password prompt. The command refuses to overwrite an existing owner. Do not place credentials in source, shell arguments, preview exports, or chat. The account uses scrypt password hashing. Sign in through the footer’s **Admin dashboard** link (`#/admin`). No live owner account is preconfigured; test credentials exist only in isolated test databases.

## Dashboard

- **Products:** add/edit products and images; set visibility and manual stock overrides; define Chicken/Tuna or other variants; set single/3/5 vial bundle prices and 10-capsule pack prices; create badges such as “New arrival” or “Back in stock”, with an optional percentage discount (0 keeps the original price). Save a draft, then publish. Public catalogue reads only the published snapshot.
- **Website text & images:** hero, shop, story, announcement and promotion banner text; photo uploads; FAQs; waiver and policy text. Save draft, then publish.
- **Stock by SKU:** edit physical quantities. These save immediately, independent of content drafts. Chicken and tuna use separate SKUs. All vial bundles of one product share a SKU and consume `quantity × units` (e.g. two bundles of three reserve six vials). Capsules are sold only in packs of 10; two packs consume 20 physical capsules. New live SKUs start at **zero**; no real inventory is invented. Retired SKU records are retained for outstanding orders and auditability.
- **Orders:** view the latest 500 requests, contact/delivery details, item and SKU snapshots, totals, status history, and notification state. Transitions: new → confirmed → fulfilled, or new/confirmed → cancelled. Cancelling restores reserved units exactly once. Fulfilled orders cannot be cancelled in this implementation.
- **Order & email settings:** independently enable order requests and owner notification emails. Settings save immediately. Both are off in the live backend by default.

Order requests reserve stock, but do **not** collect payment or calculate shipping/tax. The customer explicitly sees that payment and delivery are arranged separately. The API validates current published prices, option availability, aggregate SKU demand, waiver acceptance when a waiver exists, and expected total. SQLite transactions prevent overselling. Idempotency keys prevent duplicate reservations from network retries. Storefront stock/price estimates are rechecked on the server; client prices are not trusted.

## Email delivery (optional; deferred)

The server has a Resend integration with a persistent outbox. No email recipient or provider credential has been configured. When ready:

1. Verify a sender/domain with Resend and provide `RESEND_API_KEY` securely to the **server process**. The server needs HTTPS access to `api.resend.com`. Do not put the key in Vite/browser variables or database settings.
2. In the dashboard, set the recipient and verified sender address, then enable notifications. Use the platform’s secure secret binding to `api.resend.com` if using a proxy-backed key.
3. Validate an authorized test notification before relying on delivery. Tests currently use an injected test sender and do not send real mail.

Each order is stored with an outbox entry in the same transaction. Delivery failure does not roll back or hide an order. Pending entries survive restarts. Failed sends retry up to five attempts with backoff, and can be manually retried. Sent entries are not retried. Notifications include customer and line-item details; recipient access should be limited appropriately. Resend idempotency keys reduce duplicate deliveries after uncertain network results. If notifications remain off, old pending notifications wait; enabling delivery also sends those pending notifications.

## Production

```sh
npm ci --cache /workspace/.npm-cache
npm run build
NODE_ENV=production PUBLIC_ORIGIN=https://your-real-domain.example HOST=0.0.0.0 PORT=3001 DATA_DIR=/persistent/spring npm start
```

Replace the example origin with the exact public HTTPS origin (no trailing slash). Use a single Node.js 24 instance behind an HTTPS reverse proxy and a persistent volume for `DATA_DIR`. Production sessions use Secure, HttpOnly, SameSite cookies, expiry, and hashed session tokens. Mutations require the same Origin. Login and order requests are rate-limited; the server does not trust client-supplied forwarded-IP headers. Configure access logging and a trusted edge rate limiter at hosting. Do not deploy the database to an ephemeral/serverless filesystem or multiple unrelated instances. Keep `.data`, SQLite files, backups, and uploaded files out of Git. Only uploaded raster images are served, never the database directory.

`DATA_DIR` defaults to `.data` and contains `spring.sqlite` (plus WAL/SHM while running) and `uploads/`. Back up the database and uploaded assets using `npm run backup -- /secure/destination`; the script uses SQLite’s online backup API. Restore only while the app is stopped and preserve file permissions. Test restoration before launch.

Before accepting real requests, configure the owner login, real inventory, approved product/variant/bundle information, policies and waiver, delivery/payment process, domain/HTTPS, persistent hosting and backups. Checkout payments, tax/shipping calculation, customer login, password reset, and customer-facing tracking are not implemented. Owner order tracking is implemented.

## Tests

```sh
npm run test:api
npm test
npm run build
```

Browser tests use `/usr/bin/chromium` (override `CHROMIUM_PATH`). They start an isolated API/database on 3002 and Vite on 5174 with a test-only owner, stock values, and order requests enabled. API tests verify authentication/CSRF, draft isolation, validation, uploads, persistence, server-owned pricing, shared inventory, concurrent orders, idempotency, cancellation and email retry behavior. No production data or real mail is used.

## Downloadable offline demo

```sh
npm run export:preview
```

Creates `/workspace/shared/downloads/spring-for-cats-dashboard.html`. The standalone file includes the design, generated cat image, catalogue and demo dashboard. Use the footer’s **Admin dashboard** link without signing in. Sample stock starts at 30; requests and edits are stored only in that browser. “Publish” updates only the local demo. No real orders, backend connections, credentials, customer emails, or real email delivery are included. Use sample customer details. The real backend requires hosting and the owner login above.

Product images and initial prices came from the supplied FIP Cat Health archive; confirm rights and product information before launch. The hero image is generated in a photographic style.

## Capsule packs

All four capsule strengths are sold only as packs of 10. Initial pack prices are ten times the original individual capsule prices: 48 mg $65; 24 mg $45; 12 mg $25; 6 mg $15. These are starting prices, not benchmark-derived prices or automatic discounts. Edit the full pack price in the dashboard. Set Physical unit type to Capsule for new capsule products; validation requires a single ten-pack option.

On startup, existing draft and published single-capsule listings are upgraded once to ten-packs. Physical SKUs/stock, custom content, promotions and historical order snapshots are retained. Existing bags referring to old single-capsule options are marked unavailable for review rather than silently converted. The offline demo migrates its saved catalogue too. Stock remains a count of individual capsules.

The supplied CureFIP home, injection, capsule and FAQ PDFs have been reviewed as a visual benchmark. The storefront now uses bold sans-serif typography, emerald/lime contrast, stronger product cards and a three-step shopping guide. See [design notes](docs/design-notes.md). Competitor claims, ratings and pricing have not been imported. Owner-customized text is preserved when untouched starter copy is refreshed.
