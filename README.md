# Modul Sales Operations (PJP & Approval): Web Mockup (POC)

Interactive **frontend-only** mockup for the Unggul Plastik pre-sales demo. It shows the custom module that sits next to Mile Field (mobile) and MileApp web: PJP / call plan, outlet master, pipeline, LOA approval pages, order review, targets, dashboards and the module's own RBAC (Filament-Shield style).

- No backend. All data is dummy and lives in memory; a page reload resets the demo.
- UI language: Bahasa Indonesia.
- Both solution variants are in one app. Switch them in **Pengaturan** (labelled *Mode demo — di produksi varian ditetapkan saat deployment*):
  - **Varian A (Integrasi Odoo):** the Data page becomes *Sinkronisasi Odoo*. Odoo-owned outlet fields are read-only (badge "Odoo"). Confirmed orders are sent to Odoo as a draft Sales Order (simulated), then read back (*Dikonfirmasi di Odoo*).
  - **Varian B (Standalone):** the Data page becomes *Import / Export Excel*. Order status is managed in the module: *Dikonfirmasi → Diproses → Selesai*, or *Dibatalkan* (delivery is out of scope).
- Behaviour follows the module PRDs in `prd/modules/` (each module's Lampiran A lists what was validated against this mockup).

## Stack

Vite 6 + React 18 + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui (new-york, components vendored in `src/components/ui`) + lucide-react. MileApp Design System tokens (Primary Azure-500 `#02A8F3`, radius 6px, 8px grid, neutral scale) are mapped in `src/index.css`.

## Run

```bash
npm install
npm run dev       # http://localhost:5179
npm run build     # type-check + production build into dist/
npm run preview   # serve dist/ locally
```

## Structure

```
src/
  App.tsx                 shell + hash navigation (#/pjp, #/approval/discount, ...)
  store/app-store.tsx     in-memory state, session, permissions, approval engine
  lib/rbac.ts             resources, {action}_{resource} permissions, default role matrix
  lib/approval.ts         approval steps per type, LOA tiers, order checks
  data/mock.ts            dummy data (9 branches + HQ Direct Sales, 61 salesmen, ~320 outlets,
                          regions, routes, price lists, PJP change requests)
  pages/                  login, dashboard, pjp, outlets, pipeline, approvals, orders,
                          targets, reports, products (product & price list),
                          territory (branch / region / route / sales team),
                          data (Odoo sync / Excel), users (users, roles, permission, audit), settings
  components/             sidebar, topbar, toaster, badges, ui/ (shadcn)
```

## Demo personas

| Role | User | Data scope |
|---|---|---|
| Admin | Rina Kusuma | All |
| Commercial Director | Hendra Wijaya | All branches + HQ |
| Branch Manager | Budi Santoso | Cabang Surabaya |
| Sales SPV | Dewi Lestari | Cabang Surabaya, her own team |
| Sales Admin | Sari Anggraini | Cabang Surabaya |
| Finance & Accounting | Agus Setiawan | All |

You can switch role at any time from the user menu in the top right.

## Demo script (about 12 steps)

1. **Login as Sales SPV (Dewi Lestari).** The sidebar shows only her pages; the top bar shows *Cabang Surabaya · Tim Dewi*. The dashboard shows target vs actual, visits vs plan, effective call ratio, pipeline per stage, **overdue follow-ups (SPV / BM only)** and *Approval menunggu Anda* — click that card to jump to the approval page with the most waiting items.
2. **Outlet / Pelanggan.** The three status cards (Pelanggan Baru / Lama – sudah beli / Lama – belum beli) are **derived**: hover the info icon for the rule. Open **Buat Outlet**: no status field, but GPS pin, NPWP / PKP, segmen, rute, price group, TOP. Type the name of an existing outlet (or its phone) → the **Kemungkinan Duplikat** dialog appears (*Tetap simpan sebagai outlet baru* / *Batal*). As SPV, limit kredit / TOP / price group are read-only in Varian B (only `update_credit_limit`, default Finance); in Varian A the Odoo fields carry an "Odoo" badge.
3. **PJP / Call Plan.** Pick a salesman. The 4-week grid uses the class → frequency mapping from Pengaturan. The table shows the **route sequence** (move up / down) and *valid from / to*. **Tambah outlet** asks for the start date; removing and **Publish ke Mile Field** ask for confirmation. Tab **Permintaan Perubahan**: approve or reject the sales' change requests (`update_pjp`, no separate approve permission).
4. **Pipeline.** A *Pelanggan Baru* opportunity carries an NOO badge (NOO is created at **Prospek**: prospect outlet + Approval NOO SPV → Finance). **Buat Peluang** with type Pelanggan Baru creates both. Mark an opportunity **Batal** with a reason → it stays in its stage with an hourglass: *Batal needs SPV approval by default*. Only *Pelanggan Baru (NOO)* can be chosen because the existing-customer pipeline is **off by default** (AS-14). Try the *Follow-up* filter (Terlambat / Hari ini / 7 hari).
5. **Approval → Tahap Pipeline.** Dewi approves the Batal request; the card moves to Batal.
6. **Approval → Diskon (LOA).** The discount requests go to the **single covering tier** (Dewi: up to 5%). The 7% order discount waits for the Branch Manager. Rejecting a discount that belongs to an order **rejects the order**. Requests pending > 24 h show *Lewat SLA*.
7. **Approval → Pelanggan Baru (NOO).** Approve step 1 (data check). The request moves to Finance.
8. **Switch to Branch Manager (Budi).** Scope widens to Cabang Surabaya. Approve the 7% discount (order `SO-SBY-202611-0243`) and step 1 of a *Pesanan Khusus* (step 2 goes to the CD). Budi also approves *Limit Kredit* (Finance or BM).
9. **Switch to Finance (Agus).** On **Pelanggan Baru (NOO)** step 2, *Setujui* requires **limit kredit, TOP and price group**. The outlet becomes *Pelanggan Lama – belum beli* (Varian A: created in Odoo as res.partner). Approve the remaining *Limit Kredit* requests.
10. **Switch to Sales Admin (Sari) → Review Pesanan.** Approval is routed **automatically** when an order arrives (setting *Pemicu approval*), so the orders with credit / overdue / special price / discount issues start in *Menunggu Approval* and return to *Menunggu Review* once all approvals are approved. On a review order: edit qty or **price**, **add / remove items** (reason required, logged); a price outside the price list sends the order back to approval. Click **Simulasi pesanan masuk**: the order for the NOO customer approved in step 9 arrives and the opportunity becomes **Menang automatically** (Menang = first approved order). **Konfirmasi & Kirim ke Odoo** (Varian A) → *SO Draft di Odoo* → **Baca status dari Odoo** → *Dikonfirmasi di Odoo*. **Export Excel** is available with `export_data`.
11. **Switch to Admin (Rina) → Pengaturan.** Every card has its own **Simpan** (changes go to *Riwayat perubahan*): Pipeline & approval (Batal approval on, per-stage approval off, existing-customer pipeline off), Approval pesanan (trigger auto / manual, tier mode, credit approver, SLA), Tier LOA, read-only *Rantai approval*, PJP (class → frequency) and the other defaults. Switch to **Varian B**: Data becomes *Import / Export Excel*; in Review Pesanan confirm an order and move it *Dikonfirmasi → Diproses → Selesai* (or *Batalkan*). The first *Selesai* turns the customer into *Pelanggan Lama – sudah beli* automatically.
12. **Pengguna & Role.** *Sinkronkan dari MileApp* adds users **without a role** (no access until an Admin assigns one). Tab **Role**: create / edit / duplicate / delete roles (delete is refused while users have the role). Tab **Permission**: the matrix now also has *Master Data* (`product`, `price_list`, `branch`, `region`, `route`, `sales_team`), *Laporan* (`*_report`, `approval_log`, `adoption`) and `update_credit_limit`; untick `approve_discount` for Sales SPV and the buttons disappear for Dewi. Tab **Audit** lists role / user / setting changes. Also open **Laporan** (standard reports + simulated Excel export + adoption view), **Produk & Price List** and **Territory & Tim Sales**.

## GitHub Pages

- `vite.config.ts` uses `base: "./"` (relative), so the build works under any Pages sub-path. You can override it with `VITE_BASE=/repo-name/ npm run build`.
- Navigation is hash-based (`#/pipeline`). No server-side routing or 404 fallback is needed.
- The workflow `.github/workflows/deploy-pages.yml` builds the app (`npm ci && npm run build`) and deploys `dist/` with GitHub Pages Actions. In the repo, set **Settings → Pages → Source = GitHub Actions**.
- **Important:** GitHub only runs workflows that are in `<repo-root>/.github/workflows/`. The workflow works as-is only when **this folder is the repository root**. If you push it as a subfolder (e.g. `poc/sales-ops-web/`), move the workflow file to the root `.github/workflows/` and set `APP_DIR: "poc/sales-ops-web"` in its `env` block. The install, build and upload paths all follow `APP_DIR`.

## Notes / limits

- Mockup only: no authentication, no persistence, no real Odoo or MileApp calls. All toasts and sync states are simulated.
- The LOA tiers (Sales 2%, SPV 5%, BM 10%, CD above), the 30-day overdue rule, the 24-hour SLA and the F4 / F2 / F1 defaults are example values proposed by MileApp. UP sets the final numbers.
- Order numbers follow `SO-<branch>-<yyyymm>-<seq>`; the Mile Field client order id (`MF-ORD-…`) is shown only as a reference.
- The duplicate check compares NPWP, phone, and similar names in the same city (a stand-in for the 50 m GPS radius).
- The production stack for delivery remains Laravel + Inertia React + shadcn with `spatie/laravel-permission` and a per-resource permission generator.
