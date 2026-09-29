# Code Guideline

How code is organised here and where to put new code. What the app does and
how to run it live in `README.md`.

## AI Agent Rules

- **No AI slop design**: no generic, bloated or repetitive UI. Minimal, tailored Tailwind components over copy-pasted UI kits.
- **No AI writer tone**: commits, PRs, comments and docs in plain human tone. No em-dashes, no fluff, no robotic transitions.
- **Token efficiency**: minimal diffs, never rewrite unchanged files. YAGNI. Reuse existing helpers before writing new ones.

## Layout

```
src/
  components/    one folder per feature, ui/ for shared primitives
  context/       auth.tsx, theme.tsx
  hooks/         one data-access hook per file
  integrations/  generated Supabase client and types
  lib/           pure helpers, no React
  locales/       i18next translations
  pages/         route-level pages, flat files named <Feature>Page.tsx
  router.tsx     route table and permission guards
  App.tsx        global providers
  main.tsx       entry point
supabase/
  migrations/    schema, RLS policies, triggers
  functions/     edge functions
  templates/     auth email templates (pasted into the dashboard)
  tests/         security_smoke.sql, stock_flow_smoke.sql, stock_valuation_smoke.sql, audit_fixes_smoke.sql, security_fixes_smoke.sql
public/          logo.svg, favicon.svg, og.png, email/*.png, fonts/ (PDF only)
```

## Feature Modules

Each feature keeps its page in `src/pages/`, its data access in hook files in
`src/hooks/`, and its pieces in a folder under `src/components/`. Shared
calculations live in `src/lib/`. The sidebar, command palette and page header
all read one route list, `lib/navigation.ts`.

| Feature | Page | Hooks | Components |
| --- | --- | --- | --- |
| Master product & SKU | `MasterProductPage.tsx` | `useProducts`, `useUoms`, `useCategories`, `useOwners`, `useSuppliers`, `useCustomers` (all on `useMasterList`) | `components/master-product/` |
| Master warehouse & bin | `MasterWarehousePage.tsx` | `useWarehouses`, `useLocations`, `useWarehouseFilter`, `useStockBalances` | `components/master-warehouse/` |
| Goods receipt | `GoodsReceiptPage.tsx` | `useGoodsReceipts`, `useSuppliers`, `useAttachments` | `components/inbound/` |
| Putaway | `PutawayPage.tsx` | `usePutawayTasks` | `components/inbound/` |
| Pick list & route | `PickListPage.tsx` | `useSalesOrders`, `usePickLists`, `useCustomers` | `components/outbound/` |
| Packing & dispatch | `DispatchPage.tsx` | `useShipments`, `useSettings` | `components/outbound/` |
| Stock transfer | `StockTransferPage.tsx` | `useStockTransfers`, `useStockBalances` | `components/stock-transfer/` |
| Stock opname | `StockOpnamePage.tsx` | `useStockCounts`, `useBatches` | `components/stock-opname/` |
| Movement log & audit | `StockAuditPage.tsx` | `useStockMovement`, `useAuditLog` | `components/stock-audit/` |
| Dashboard | `DashboardPage.tsx` | `useFinance` (`useDashboardSummary`), `useSettings` | `components/dashboard/` |
| Valuation & finance | `StockValuationPage.tsx` | `useFinance`, `useSettings`, `useSidebarCounts` | `components/valuation/` |
| Integration & users | `IntegrationSettingsPage.tsx` | `useIntegration`, `useUsers`, `usePermissions`, `useOwners` | `components/integration/` |
| Export | `ExportPage.tsx` | `useStockMovement` (`movementsQuery`), `useStockCounts`, `useSkuLookup` | - |
| Superadmin | `SuperadminPage.tsx` (hidden, `is_superadmin` only) | - (RPCs called in the page) | `components/superadmin/` |
| Auth | `LoginPage.tsx` (demo accounts when `public_demo_mode()`), `ResetPasswordPage.tsx` | `context/auth` | `components/auth/` |
| Profile, guide | `ProfileSettingsPage.tsx`, `GuidePage.tsx` (per-feature help, workflows by role, tour replay) | `usePermissions` | `components/layout/` |
| Errors | `ForbiddenPage.tsx`, `NotFound.tsx` | - | - |

Tours: steps in `lib/tours.ts` (keyed by feature key, targets `data-tour`),
texts in `guide.tours.<key>`. `useFirstVisitTour` in `AppShell` runs a page's
tour once per user per browser; the Guide page replays it.

Shared pieces worth knowing before writing a new one:
`lib/fefo.ts` (FEFO/FIFO allocation and serpentine walk; reference copy of `generate_pick_list`), `lib/putaway.ts` (bin ranking; reference copy of `suggest_putaway_bins`), `lib/barcode.ts` (scan to SKU + unit), `lib/scanFeedback.ts` (beep + vibrate), `lib/valuation.ts` (FIFO layers, moving average; reference copy of the SQL costing), `lib/uom.ts` (unit conversion and breakdown), `lib/variants.ts` (variant
matrix, attribute order), `lib/locations.ts` (layout ranges, bin fill bands),
`lib/labels.ts` (barcode/QR label PDF, A4 sheet or 50 x 30 mm thermal), `lib/permissions.ts` (role and
override merge), `lib/period.ts` (period filtering by date prefix),
`lib/exportReport.ts` (`safeCell` against formula injection, `exportExcel`/`exportPdf` for any table),
`lib/productSheet.ts` (product Excel columns, row validation, export), `lib/utils.ts` (`rupiah`, `qtyText`).
`components/common/` holds what several features share: `Field` + `selectClass`,
`StatusBadge`, `LocationTag`, `BatchTag`, `QtyWithUom`, `SkuPicker`,
`ConfirmDialog`, `MasterSection`, `FilterSelect`, `LabelPrintDialog` (SKU and bin labels). Scanning goes through
`components/scanner/ScanInput` (hardware scanners type + Enter; camera via the
native BarcodeDetector). The header
warehouse filter is `useWarehouseFilter()`; pages that list stock should honour it.
`useSkuLookup()` gives SKU code, label, units and conversions by id; use it
instead of building product maps per page.

## Adding Code

- **Page**: add `src/pages/<Feature>Page.tsx`, register it in `src/router.tsx`
  with `guarded("<feature key>", ...)` if it needs a permission, `load(...)` if
  any signed-in user may open it.
- **Component**: put it in the feature folder under `src/components/`,
  or `components/ui/` if more than one feature uses it. One responsibility per
  file, under 100 lines where practical.
- **Hook**: one file per hook in `src/hooks/`, named `use<Thing>.ts`.
- **Utility**: `src/lib/`, pure functions, no React imports.

Naming: `PascalCase` for components and pages, `camelCase` for hooks and
utilities. Update this file's table when you add or remove a page or feature
hook.

## Database Rules Live in the Database

Access, approvals, the period lock, stock balances and the audit trail are
enforced by RLS policies, triggers and `SECURITY DEFINER` RPCs, not by the UI.
The UI only hides actions the database would refuse. The rules live in
`supabase/migrations/`, with runnable proof in `supabase/tests/security_smoke.sql`.
When you add a rule that protects data, add a case to the matching test.

- Stock only changes through `post_stock_movement()`, called by other
  `SECURITY DEFINER` RPCs. It inserts the movement (a trigger moves the
  balance, checks free stock, capacity, batch and period lock) and books cost:
  to-only = stock in (new FIFO layer, moving average), from-only = stock out
  (layers consumed, COGS for both methods), both = internal move, no cost.
  Clients have no write grant on any ledger or cost table.
- Movements are append-only. Correct a mistake with a new movement.
- Approving (stock opname, transfer variances) needs `stock-approval:update`
  (`can_approve()`). Whoever submitted or counted a count
  (`t_stock_count_counters`), or received a transfer, cannot approve it.
- Document status only moves through RPCs (`post_goods_receipt`,
  `cancel_goods_receipt`, `send_transfer`, `cancel_stock_transfer`,
  `cancel_sales_order`, `reject_stock_count`, `cancel_stock_count`, ...).
  `guard_document_status` refuses a direct API update of a status, and any
  edit or delete once a document left its editable status.
- Scans are idempotent: `complete_putaway` and `confirm_pick_line` take a
  `p_request_id` (the hooks send `crypto.randomUUID()`), stored on the
  movement (`t_stock_movements.request_id`, unique). A retry returns quietly.
- Receipt prices go through `set_receipt_costs` (draft only, `valuation:update`);
  without a price the layer takes the last purchase price and is an estimate.
- Blind counts: `t_stock_count_lines.system_qty` has no column grant for API
  roles; approvers read it through `count_review()`. Select explicit columns
  from that table, never `*`.
- Cost data sits in its own tables so RLS can hide it from Workers while they
  still read movements and receipts.
- Valuation: cost pools are per SKU and owner across warehouses; a
  warehouse's value is its quantity times the pool's unit cost. Client-owned
  stock is quantity only (`stock_valuation` returns null money). As-of values
  replay the ledger (`valuation_rows`, FIFO from the newest layers, average
  from `t_avg_cost_log`). `revalue_receipt` reprices what is left and books
  what already left as a `revaluation` COGS entry.
- Period lock is one date, `m_settings.locked_until`: nothing dated on or
  before it is booked (`guard_period_lock` on movements and COGS). Moving it
  forward (`set_locked_until`) needs `valuation:update`; moving it back or
  clearing it is Admin only. The column has no client update grant.
- `snapshot_stock_value()` fills `t_stock_value_snapshots` for the dashboard
  trend; `run_daily_jobs()` calls it every morning.
- Product import is one call to `import_products(rows)`, all or nothing.
- API keys: `create_api_key` returns the key once and stores only its SHA-256
  (`key_hash` has no column grant). `api-v1` authenticates with the service
  role through `api_authenticate` (scope, revoked/expired, 60 requests/minute),
  then `api_stock`, `api_products` or `api_create_order` (idempotent per
  `Idempotency-Key`). These `api_*` functions are revoked from clients.
- Webhooks: triggers call `enqueue_webhook_event`; `t_webhook_secrets` has no
  client grant at all. `webhook-dispatch` claims due rows with
  `claim_webhook_deliveries` (SKIP LOCKED + lease), signs with
  `_shared/signature.ts`, refuses private targets with `_shared/ssrf.ts` and
  reports through `record_webhook_result` (backoff 1m, 5m, 30m, 2h; the fifth
  failure is final; 20 final failures in a row switch the webhook off).
- Demo mode (`m_settings.demo_mode`, set by the seed): API keys cannot get
  `orders:write`, webhooks only go to `https://webhook.site/` or
  `https://example.com/`, and `lock_demo_credentials` stops the Auth API from
  changing `admin@stockdesk.com` or `*@stockdesk.demo` logins.
- Demo seed: `superadmin_seed_demo_data()` wipes (`wipe_all_data()`), then
  replays about six months through the normal RPCs. `demo_act(date, user)`
  moves "today" with the transaction-local setting `stockdesk.today`, which
  `company_today()` honours; API roles cannot set it. After a seed all three
  smoke tests must still pass. The superadmin page confirms a wipe by typing WIPE.
- `m_roles.rank`: a lower number means more power (Admin 1, Manager 2,
  Worker 3). New accounts start without a role and see `PendingAccessScreen`
  until an Admin gives them one. The superadmin (the app owner) is a flag and
  also holds the Admin role, so the owner sees every page.
- A product's owner is fixed once any of its SKUs has moved
  (`guard_sku_owner_change`); a 13-digit barcode must pass the EAN-13 check;
  decimal units (KG, GR, L, ML) can only be a base unit.
- Supabase grants `EXECUTE` on new functions to `anon`; every migration that
  adds functions revokes that again.
- Hosted Supabase runs API requests with `pg_safeupdate`: an `UPDATE` or
  `DELETE` without `WHERE` fails even inside a `SECURITY DEFINER` function
  (write `WHERE id = 1` for `m_settings`). psql smoke tests do not load it.

## Tests

`pnpm test:run` for a single pass. Vitest, node environment, no jsdom. It
covers the pure logic in `src/lib/` (`fefo.ts`, `putaway.ts`, `barcode.ts`, `valuation.ts`, `uom.ts`, `variants.ts`, `locations.ts`,
`permissions.ts`, `period.ts`, `exportReport.ts`, `productSheet.ts`, the auth BFF, and the edge helpers
`supabase/functions/_shared/signature.ts` and `ssrf.ts`). Database rules are proved by the SQL smoke tests, which run in one
transaction and roll back:

```bash
psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/security_smoke.sql
psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/stock_valuation_smoke.sql
psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/stock_flow_smoke.sql
psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/security_fixes_smoke.sql
```

`stock_valuation_smoke.sql` shares its fixture with `valuation.test.ts`, and the
putaway and outbound parts of `stock_flow_smoke.sql` share their layouts with
`putaway.test.ts` and `fefo.test.ts`; change each pair together.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server on port 8080 |
| `pnpm build` | Type check, then production build to `dist/` |
| `pnpm preview` | Serve the built `dist/` |
| `pnpm lint` | ESLint over the repo |
| `pnpm test` | Vitest in watch mode |
| `pnpm test:run` | Vitest, single pass |

## Cron & secrets

The integration migration creates `pg_cron` and `pg_net` and schedules three
jobs (idempotent): `stockdesk-webhook-dispatch` every minute
(`dispatch_webhooks()`), `stockdesk-daily` at 23:00 UTC = 06:00 WIB
(`run_daily_jobs()`: expiry and reorder summary, `batch.expiring`, stock value
snapshot) and `stockdesk-housekeeping` weekly (`run_housekeeping()`; never
touches the ledger or audit log). If the extensions are off in the dashboard,
enable them first. Webhook dispatch also needs:

- Vault secrets `project_url` (`https://<ref>.supabase.co`) and
  `cron_dispatch_secret`; without them the job quietly does nothing.
- The same value as the edge function secret `CRON_DISPATCH_SECRET`
  (`supabase secrets set CRON_DISPATCH_SECRET=...`).

## Deployment Notes

- `.env` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, both
  public (RLS protects the data). The app fails at startup if either is
  missing. Set the same two on Vercel.
- Requests go through `/supabase-api` (`vite.config.ts` in dev, `vercel.json`
  in production) so the app calls its own origin. The `vercel.json` rewrite
  hardcodes the Supabase host; update it if the project ref changes.
- The canonical, `og:*` and `twitter:*` URLs in `index.html` (and the email
  illustrations in `supabase/templates/`) are hardcoded to
  `https://stockdesk.mujahidin.my.id`; change them if the domain changes.
- `vercel.json` enforces the Content Security Policy. Its `script-src` carries
  the SHA-256 of the inline theme script in `index.html`; recompute it whenever
  that script changes, or the page loads without the theme and the console
  reports a violation. Check a build with enforced CSP locally through
  `pnpm build && pnpm preview` (the auth proxy runs in preview too).
  `main.tsx` sets zod to jitless because its JIT probe uses `new Function`.
- Enable `pg_cron` and `pg_net`, fill the Vault secrets and
  `CRON_DISPATCH_SECRET` (see Cron & secrets). Deploy the edge functions
  `create-user`, `delete-user`, `reactivate-user`, `seed-admin`, `api-v1` and
  `webhook-dispatch`.
- Email templates live in `supabase/templates/` (see its README); their
  illustrations are `public/email/*.png`.
- `seed-admin` is for creating the first admin once. Remove `SEED_ADMIN_SECRET`
  from the function secrets after using it. Never run the demo seed on a real
  company's database.
