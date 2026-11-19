# Modul Sales Operations (PJP & Approval): Web Mockup (POC)

Interactive **frontend-only** mockup for the Unggul Plastik pre-sales demo. It shows the custom module that sits next to Mile Field (mobile) and MileApp web: PJP / call plan, outlet master, pipeline, request pages (LOA, New Customer, Tahap Pipeline), order review, targets, reports and the module's own RBAC (Filament-Shield style). There is no module login: users come in from MileApp (D-52).

- No backend. All data is dummy and lives in memory; a page reload resets the demo.
- UI language: Bahasa Indonesia.
- Both solution variants are in one app. Switch them in **Pengaturan** (labelled *Mode demo — di produksi varian ditetapkan saat deployment*):
  - **Varian A (Integrasi Odoo):** the Integration menu shows *Sinkronisasi Odoo*. Odoo-owned outlet fields are read-only (badge "Odoo"). Confirmed orders are sent to Odoo as a draft Sales Order (simulated), then read back (*Dikonfirmasi di Odoo*).
  - **Varian B (Standalone):** the Integration menu shows *Import & Export Excel*. Order status is managed in the module: *Dikonfirmasi → Diproses → Selesai*, or *Dibatalkan* (delivery is out of scope).
- **Setup flow (D-46):** Dashboard card *Alur Setup Sales Operations* shows the order of work with live status: 1 Territory & Tim Sales → 2 **Plotting Pelanggan** (outlet → salesman owner + route; bulk move puts the outlets into the target salesman's PJP as Draft, open pipeline follows, ownership history) → 3 Produk, Price List & **Assortment Produk** (products per segment, must-sell flags, per-outlet exceptions; feeds the Mile Field order catalog) → 4 PJP (generate → publish; approval only when enabled in Pengaturan) → 5 visit tasks in Mile Field.
- Behaviour follows the module PRDs in `prd/modules/` (each module's Lampiran A lists what was validated against this mockup).

- **Menu (D-53):** Dashboard · **Master** (Outlet / Pelanggan, Produk & Price List, Assortment Produk, Territory & Tim Sales) · **Sales Operation** (PJP / Call Plan, Plotting Pelanggan, Pipeline, Review Pesanan, Target) · **Request** (LOA, New Customer, Tahap Pipeline) · **Report** (Laporan) · **Integration** (Admin) · **Setting** (Pengaturan, Users, Role, Permission, Audit Log; Admin).
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
  App.tsx                 shell + hash navigation (#/pjp, #/request/loa, #/audit-log, ...)
  store/app-store.tsx     in-memory state, session, permissions, approval engine
  lib/rbac.ts             resources, {action}_{resource} permissions, default role matrix
  lib/approval.ts         request steps per type, LOA tiers, order checks
  data/mock.ts            dummy data (9 branches + HQ Direct Sales, salesmen, ~5,800 outlets,
                          routes / beats, PJP entries, holidays, price lists, change requests)
  data/pjp-engine.ts      PJP logic: F1 / F2 / F4 patterns, auto-generate + balancing, simulated execution
  pages/                  dashboard, outlets, products, assortment, territory, pjp, plotting, pipeline,
                          orders, targets, approvals (Request pages), reports, data (Integration),
                          settings, users (Users / Role / Permission / Audit Log pages)
  components/             sidebar, topbar, toaster, badges, setup guide, ui/ (shadcn)
```

## Roles and approvals (D-54)

Everything is decided by the **permissions on the user's role + its data scope** (Filament Shield style); no code checks a role name. Approvals use custom permissions: LOA discount tiers are value bands each linked to a permission (≤ 2% no approval, 2–5% `approve_discount_tier_1`, > 5% `approve_discount_tier_2`; a higher tier may also decide a lower one); special order = `approve_special_order` → `approve_special_order_final`; NOO = `approve_noo` → `approve_noo_credit` (credit limit / TOP / price group); credit override, pipeline stage and PJP = `approve_credit_override`, `approve_pipeline_stage`, `approve_pjp`. A pending step goes to every user whose role holds the step's permission and whose scope covers the request. The two roles below are **seeded demo examples**, freely editable in Setting → Role / Permission:

| Role (seed) | User | Data scope | Approval permissions |
|---|---|---|---|
| Admin | Rina Kusuma | All branches | all |
| Sales Supervisor | Dewi Lestari | Cabang Surabaya, her own team | tier_1, approve_noo, approve_special_order, approve_credit_override, approve_pipeline_stage |

No login screen: switch with **Ganti role (demo)** in the user menu (top right).

## Demo script

1. **Sales Supervisor (Dewi).** The sidebar has no Integration / Setting. The dashboard shows targets, visits vs plan, pipeline, *Request menunggu Anda* (click to open the Request page) and the **Alur Setup Sales Operations** checklist.
2. **Outlet / Pelanggan.** Status cards are derived (Pelanggan Baru / Lama – sudah beli / Lama – belum beli). No class, no frequency on the outlet (D-48); optional **Hari kunjungan** (D-51). Typing an existing name or phone in *Buat Outlet* opens **Kemungkinan Duplikat**.
3. **PJP / Call Plan.** Pick a Surabaya salesman: week view (Senin–Sabtu, 10–15 visits/day in route order, capacity badge). Drag cards between days or salesmen; frequency per entry is **F1 / F2 / F4** only (D-47; more than weekly = F4 + extra call). Days when the outlet is closed show "Outlet tutup" as a warning, not a block (D-51). Try *Generate otomatis*, *Import*, *Export*, *Salin ke siklus berikutnya*, the holiday shift, and the tabs *Cakupan & Beban*, *Eksekusi*, *Permintaan Perubahan*.
4. **Publish (D-53).** Default: no PJP approval. The Sales Supervisor clicks **Publish ke Mile Field** on a Draft (Draft → Dipublikasikan); the week's visit tasks are created in route order. A published PJP is locked; changes create a new Draft version. Optional: enable **PJP perlu approval sebelum publish (pemegang approve_pjp)** in Pengaturan; then *Ajukan Approval* → a holder of `approve_pjp` decides in the **Approval PJP** tab → Publish only for Disetujui.
5. **Plotting Pelanggan / Assortment Produk.** Move outlets between salesmen (they enter the target PJP as Draft); assortment per segment with must-sell flags and per-outlet exceptions.
6. **Pipeline.** Mark an opportunity **Batal** with a reason: it waits for a holder of `approve_pipeline_stage` under **Request → Tahap Pipeline**.
7. **Request → LOA.** One page for discount, special order and credit-limit requests. Dewi holds `approve_discount_tier_1` (2–5%); above 5% only holders of `approve_discount_tier_2` (seed: Admin) see Setujui. Rejecting an order's discount rejects the order.
8. **Request → New Customer.** Step 1 `approve_noo` verifies the data (Dewi); step 2 `approve_noo_credit` sets credit limit, TOP and price group (seed: Admin).
9. **Review Pesanan.** Orders with failed checks go to approval automatically, then back to *Menunggu Review*. Edit qty / price / items (reason logged). *Simulasi pesanan masuk* makes the NOO opportunity **Menang**. Variant A: *Konfirmasi & Kirim ke Odoo* → *Baca status dari Odoo*; Variant B: *Dikonfirmasi → Diproses → Selesai*.
10. **Admin (Rina) → Setting → Pengaturan.** Each card saves on its own (*Riwayat perubahan*). Switch **Varian A / B**: Integration shows *Sinkronisasi Odoo* or *Import & Export Excel*.
11. **Setting → Users / Role / Permission / Audit Log.** *Sinkronkan dari MileApp* adds users without a role; create / duplicate roles; untick `approve_discount_tier_1` (or tick `approve_discount_tier_2`) for Sales Supervisor in **Permission** and Dewi's Setujui buttons change at once; **Audit Log** lists user / role / setting changes.
12. **Report → Laporan.** Standard reports with simulated Excel export.

## GitHub Pages

- `vite.config.ts` uses `base: "./"` (relative), so the build works under any Pages sub-path. You can override it with `VITE_BASE=/repo-name/ npm run build`.
- Navigation is hash-based (`#/pipeline`). No server-side routing or 404 fallback is needed.
- The workflow `.github/workflows/deploy-pages.yml` builds the app (`npm ci && npm run build`) and deploys `dist/` with GitHub Pages Actions. In the repo, set **Settings → Pages → Source = GitHub Actions**.
- **Important:** GitHub only runs workflows that are in `<repo-root>/.github/workflows/`. The workflow works as-is only when **this folder is the repository root**. If you push it as a subfolder (e.g. `poc/sales-ops-web/`), move the workflow file to the root `.github/workflows/` and set `APP_DIR: "poc/sales-ops-web"` in its `env` block. The install, build and upload paths all follow `APP_DIR`.

## Notes / limits

- Mockup only: no authentication, no persistence, no real Odoo or MileApp calls. All toasts and sync states are simulated.
- The LOA tiers (2% without approval, 5% tier 1, tier 2 above), the 30-day overdue rule, the 24-hour SLA, the default frequency F2, the 12 / 15 calls-per-day capacity and the dummy holidays are example values proposed by MileApp. UP sets the final numbers.
- Order numbers follow `SO-<branch>-<yyyymm>-<seq>`; the Mile Field client order id (`MF-ORD-…`) is shown only as a reference.
- The duplicate check compares NPWP, phone, and similar names in the same city (a stand-in for the 50 m GPS radius).
- The production stack for delivery remains Laravel + Inertia React + shadcn with `spatie/laravel-permission` and a per-resource permission generator.
