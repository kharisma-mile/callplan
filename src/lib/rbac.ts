import type { ApprovalType, RoleDef, RoleKey } from "@/data/types";

/** Shield-style resources: every page gets CRUD permissions `{action}_{resource}`. */
export const CRUD = ["view_any", "view", "create", "update", "delete"] as const;
export type CrudAction = (typeof CRUD)[number];

export interface ResourceDef {
  key: string;
  label: string;
  group: string;
  crud: CrudAction[]; // which CRUD actions apply
  custom: string[]; // custom permissions (full names)
}

export const RESOURCES: ResourceDef[] = [
  { key: "dashboard", label: "Dashboard", group: "Dashboard", crud: ["view_any"], custom: [] },
  { key: "outlet", label: "Outlet / Pelanggan", group: "Master", crud: [...CRUD], custom: ["import_outlet", "export_outlet", "update_credit_limit"] },
  { key: "pjp", label: "PJP / Call Plan", group: "Sales Operation", crud: [...CRUD], custom: ["approve_pjp", "publish_pjp"] },
  { key: "outlet_assignment", label: "Plotting Pelanggan", group: "Sales Operation", crud: ["view_any"], custom: ["reassign_outlet", "import_outlet_assignment"] },
  { key: "opportunity", label: "Pipeline", group: "Sales Operation", crud: [...CRUD], custom: [] },
  { key: "order", label: "Review Pesanan", group: "Sales Operation", crud: ["view_any", "view", "update"], custom: ["confirm_order"] },
  { key: "target", label: "Target", group: "Sales Operation", crud: [...CRUD], custom: [] },
  { key: "discount", label: "Request Diskon (LOA)", group: "Request", crud: ["view_any", "view"], custom: ["approve_discount"] },
  { key: "special_order", label: "Request Pesanan Khusus (LOA)", group: "Request", crud: ["view_any", "view"], custom: ["approve_special_order"] },
  { key: "credit_override", label: "Request Limit Kredit (LOA)", group: "Request", crud: ["view_any", "view"], custom: ["approve_credit_override"] },
  { key: "noo", label: "Request New Customer (NOO)", group: "Request", crud: ["view_any", "view"], custom: ["approve_noo"] },
  { key: "pipeline_stage", label: "Request Tahap Pipeline", group: "Request", crud: ["view_any", "view"], custom: ["approve_pipeline_stage"] },
  { key: "product", label: "Produk", group: "Master", crud: [...CRUD], custom: [] },
  { key: "price_list", label: "Price List", group: "Master", crud: [...CRUD], custom: [] },
  { key: "assortment", label: "Assortment Produk", group: "Master", crud: [...CRUD], custom: [] },
  { key: "branch", label: "Cabang", group: "Master", crud: ["view_any", "view", "update"], custom: [] },
  { key: "region", label: "Region", group: "Master", crud: [...CRUD], custom: [] },
  { key: "route", label: "Rute / Territory", group: "Master", crud: [...CRUD], custom: [] },
  { key: "sales_team", label: "Tim Sales", group: "Master", crud: ["view_any", "view", "update"], custom: [] },
  { key: "visit_report", label: "Laporan Kunjungan", group: "Report", crud: ["view_any"], custom: [] },
  { key: "call_compliance_report", label: "Laporan Call Compliance", group: "Report", crud: ["view_any"], custom: [] },
  { key: "order_report", label: "Laporan Pesanan", group: "Report", crud: ["view_any"], custom: [] },
  { key: "approval_log", label: "Log Approval", group: "Report", crud: ["view_any"], custom: [] },
  { key: "noo_report", label: "Laporan NOO", group: "Report", crud: ["view_any"], custom: [] },
  { key: "pipeline_report", label: "Laporan Pipeline", group: "Report", crud: ["view_any"], custom: [] },
  { key: "survey_report", label: "Laporan Survey Kompetitor", group: "Report", crud: ["view_any"], custom: [] },
  { key: "target_achievement_report", label: "Laporan Pencapaian Target", group: "Report", crud: ["view_any"], custom: [] },
  { key: "outlet_report", label: "Laporan Outlet", group: "Report", crud: ["view_any"], custom: [] },
  { key: "must_sell_report", label: "Laporan Kepatuhan Must-sell", group: "Report", crud: ["view_any"], custom: [] },
  { key: "adoption", label: "Adopsi Aplikasi", group: "Report", crud: ["view_any"], custom: [] },
  { key: "data", label: "Integrasi (Sinkronisasi Odoo / Import-Export Excel)", group: "Integration", crud: ["view_any"], custom: ["sync_data", "import_data", "export_data"] },
  { key: "setting", label: "Pengaturan", group: "Setting", crud: ["view_any", "update"], custom: [] },
  { key: "user", label: "Users", group: "Setting", crud: [...CRUD], custom: [] },
  { key: "role", label: "Role & Permission", group: "Setting", crud: [...CRUD], custom: [] },
  { key: "audit_log", label: "Audit Log", group: "Setting", crud: ["view_any"], custom: [] },
];

export function allPermissions(): string[] {
  return RESOURCES.flatMap((r) => [...r.crud.map((a) => `${a}_${r.key}`), ...r.custom]);
}

export const ROLE_META: Record<RoleKey, RoleDef> = {
  admin: { key: "admin", builtin: true, label: "Admin", scope: "all", scopeLabel: "Semua cabang", desc: "Semua data dan pengaturan; memutuskan request di atas tier Sales Supervisor" },
  spv: { key: "spv", builtin: true, label: "Sales Supervisor", scope: "team", scopeLabel: "Tim sendiri", desc: "PJP tim, plotting dalam tim, pipeline, review pesanan, request sesuai tier LOA" },
};

export const SCOPE_LABEL = { all: "Semua cabang", branch: "Cabang sendiri", team: "Tim sendiri" } as const;

export const ROLE_ORDER: RoleKey[] = ["admin", "spv"];

const p = (res: string, actions: string[]) => actions.map((a) => `${a}_${res}`);
const VIEW = ["view_any", "view"];

/** D-52/D-53: Admin = everything; Sales Supervisor = own team (Master read-only, no Integration / Setting). */
export function defaultPermissions(): Record<string, string[]> {
  return {
    admin: allPermissions(),
    spv: [
      "view_any_dashboard",
      ...p("pjp", [...CRUD]), "publish_pjp",
      ...p("outlet", ["view_any", "view", "create", "update"]), "export_outlet",
      "view_any_outlet_assignment", "reassign_outlet",
      ...p("opportunity", [...CRUD]),
      ...p("order", ["view_any", "view", "update"]), "confirm_order",
      ...p("target", VIEW),
      ...p("discount", VIEW), "approve_discount",
      ...p("special_order", VIEW), "approve_special_order",
      ...p("credit_override", VIEW), "approve_credit_override",
      ...p("noo", VIEW), "approve_noo",
      ...p("pipeline_stage", VIEW), "approve_pipeline_stage",
      ...p("product", VIEW), ...p("price_list", VIEW), ...p("assortment", VIEW),
      ...p("route", ["view_any", "view", "create", "update"]), ...p("sales_team", VIEW),
      ...["visit_report", "call_compliance_report", "order_report", "approval_log", "pipeline_report", "survey_report", "noo_report", "target_achievement_report", "must_sell_report"].map((r) => `view_any_${r}`),
    ],
  };
}

export const APPROVAL_META: Record<ApprovalType, { label: string; short: string; resource: string; perm: string; desc: string }> = {
  discount: { label: "Request Diskon", short: "Diskon", resource: "discount", perm: "approve_discount", desc: "Diskon di atas kewenangan Sales, sesuai tier LOA (Level of Authority)." },
  special_order: { label: "Request Pesanan Khusus", short: "Pesanan Khusus", resource: "special_order", perm: "approve_special_order", desc: "Harga di luar price list, produk non-katalog / proyek, atau TOP khusus." },
  credit_override: { label: "Request Limit Kredit", short: "Limit Kredit", resource: "credit_override", perm: "approve_credit_override", desc: "Pesanan yang melebihi limit kredit atau piutang jatuh tempo pelanggan." },
  noo: { label: "Request New Customer (NOO)", short: "New Customer", resource: "noo", perm: "approve_noo", desc: "Registrasi pelanggan baru dari lapangan. Sales Supervisor memeriksa data, Admin menetapkan limit kredit / TOP / price group." },
  pipeline_stage: { label: "Request Tahap Pipeline", short: "Tahap Pipeline", resource: "pipeline_stage", perm: "approve_pipeline_stage", desc: "Perpindahan tahap pipeline (Batal secara default; semua tahap jika diaktifkan di Pengaturan)." },
};

/** D-52/D-53 Request menu (LOA · New Customer · Tahap Pipeline): LOA merges discount, special order and credit override in one page. */
export type RequestPage = "loa" | "noo" | "pipeline";
export const REQUEST_PAGES: Record<RequestPage, { title: string; desc: string; types: ApprovalType[] }> = {
  loa: {
    title: "Request LOA",
    desc: "Diskon, pesanan khusus dan kelonggaran limit kredit sesuai Level of Authority. Sales Supervisor memutuskan dalam tiernya; di atasnya Admin.",
    types: ["discount", "special_order", "credit_override"],
  },
  noo: { title: "Request New Customer (NOO)", desc: APPROVAL_META.noo.desc, types: ["noo"] },
  pipeline: { title: "Request Tahap Pipeline", desc: APPROVAL_META.pipeline_stage.desc, types: ["pipeline_stage"] },
};
export const requestPageOf = (t: ApprovalType): RequestPage => (t === "noo" ? "noo" : t === "pipeline_stage" ? "pipeline" : "loa");
