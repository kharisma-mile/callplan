# Modul Sales Operations (PJP & Approval): Web Mockup (POC)

Interactive **frontend-only** mockup for the Unggul Plastik pre-sales demo. It shows the custom module that sits next to Mile Field (mobile) and MileApp web: PJP / call plan, outlet master, pipeline, LOA approval pages, order review, targets, dashboards and the module's own RBAC (Filament-Shield style).

- No backend. All data is dummy and lives in memory; a page reload resets the demo.
- UI language: Bahasa Indonesia.
- Both solution variants are in one app. Switch them in **Pengaturan**:
  - **Varian A (Integrasi Odoo):** the Data page becomes *Sinkronisasi Odoo*. Confirmed orders are sent to Odoo as a draft Sales Order (simulated).
  - **Varian B (Standalone):** the Data page becomes *Import / Export Excel*. Order status is managed inside the module.

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
  data/mock.ts            dummy data (9 branches + HQ Direct Sales, 61 salesmen, ~320 outlets)
  pages/                  login, dashboard, pjp, outlets, pipeline, approvals, orders,
                          targets, data (Odoo sync / Excel), users (RBAC), settings
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

## Demo script (about 10 steps)

1. **Login as Sales SPV (Dewi Lestari).** The sidebar shows only the pages her role can see, and the top bar shows the data scope *Cabang Surabaya · Tim Dewi*. The dashboard shows target vs actual per salesman, visits vs plan, the effective call ratio, pipeline per stage, overdue follow-ups and the approvals waiting for her.
2. **PJP / Call Plan.** Pick a salesman. The 4-week grid shows outlets by frequency (A = F4, B = F2, C = F1). The orange dashed chips are *extra calls* that come from pipeline follow-ups. Add an outlet with **Tambah outlet**, remove one with the x on a chip, then click **Publish ke Mile Field** (a toast confirms that visit tasks were created).
3. **Pipeline.** Use the Kanban (drag and drop) or the List view. Open a card: it shows the stage stepper, estimated value and next follow-up. Mark one opportunity **Batal** and pick a reason from the dropdown. Mark a *Pelanggan Baru (NOO)* opportunity **Menang**: an NOO approval (SPV, then Finance) is created automatically.
4. **Approval → Diskon (LOA).** Dewi approves the 4% and 4.5% requests (SPV tier, up to 5%). The 7% request (linked to an order) shows *Menunggu Branch Manager / Commercial Director*. Open the eye icon to see the approval flow and the audit trail (user, permission, time, reason). A rejection requires a reason.
5. **Approval → Pelanggan Baru (NOO).** Approve step 1 (data check by SPV). The request moves on to Finance.
6. **Switch to Branch Manager (Budi).** The scope widens to the whole Surabaya branch. Approve the 7% discount that is linked to order `MF-ORD-2611-0243`, and step 1 of a *Pesanan Khusus* request (step 2 goes to the CD).
7. **Switch to Sales Admin (Sari) → Review Pesanan.** Each order shows checks for price list, UoM, discount within LOA and credit / overdue. You can:
   - change a quantity, with a required reason that is written to the log;
   - on an order that is over the credit limit (`…0242`) or more than 30 days overdue (`…0245`), click **Ajukan approval** to send it to the *Limit Kredit* approval page;
   - on a clean order, click **Konfirmasi & Kirim ke Odoo** (Varian A). The status runs *Mengirim ke Odoo → SO Draft di Odoo* and shows an SO number.
8. **Switch to Finance (Agus).** Approve the credit-limit request. Go back to Sales Admin: the order is ready to confirm.
9. **Switch to Admin (Rina) → Pengaturan.** Change to **Varian B**. The Data menu becomes *Import / Export Excel*: try an import with the validation preview (valid and rejected rows). Back in Review Pesanan, confirming an order now keeps the status in the module (*Dikonfirmasi → Diproses Gudang → Dikirim → Selesai*). Also turn on **Approval per tahap pipeline**, which adds the *Tahap Pipeline* approval page, and edit the LOA tiers.
10. **Pengguna & Role → Permission.** This is the Shield-style matrix: one row per resource / page, with `view_any / view / create / update / delete` plus custom permissions (`approve_*`, `import_*`, `export_*`, `publish_pjp`, `confirm_order`, `sync_data`). Select *Sales SPV* and untick `approve_discount` or `view_any_pjp`. Then switch to Dewi: the menu or the buttons are gone straight away. Use **Reset default** to restore. **Sinkronkan dari MileApp** adds users (simulated).

## GitHub Pages

- `vite.config.ts` uses `base: "./"` (relative), so the build works under any Pages sub-path. You can override it with `VITE_BASE=/repo-name/ npm run build`.
- Navigation is hash-based (`#/pipeline`). No server-side routing or 404 fallback is needed.
- The workflow `.github/workflows/deploy-pages.yml` builds the app (`npm ci && npm run build`) and deploys `dist/` with GitHub Pages Actions. In the repo, set **Settings → Pages → Source = GitHub Actions**.
- **Important:** GitHub only runs workflows that are in `<repo-root>/.github/workflows/`. The workflow works as-is only when **this folder is the repository root**. If you push it as a subfolder (e.g. `poc/sales-ops-web/`), move the workflow file to the root `.github/workflows/` and set `APP_DIR: "poc/sales-ops-web"` in its `env` block. The install, build and upload paths all follow `APP_DIR`.

## Notes / limits

- Mockup only: no authentication, no persistence, no real Odoo or MileApp calls. All toasts and sync states are simulated.
- The LOA tiers (Sales 2%, SPV 5%, BM 10%, CD above), the 30-day overdue rule and the F4 / F2 / F1 defaults are example values proposed by MileApp. UP sets the final numbers.
- The production stack for delivery remains Laravel + Inertia React + shadcn with `spatie/laravel-permission` and a per-resource permission generator.
