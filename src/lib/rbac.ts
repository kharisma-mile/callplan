import type { ApprovalType, RoleKey, ScopeType } from "@/data/types";

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
  { key: "dashboard", label: "Dashboard", group: "Umum", crud: ["view_any"], custom: [] },
  { key: "pjp", label: "PJP / Call Plan", group: "Operasional", crud: [...CRUD], custom: ["publish_pjp"] },
  { key: "outlet", label: "Outlet / Pelanggan", group: "Operasional", crud: [...CRUD], custom: ["import_outlet", "export_outlet"] },
  { key: "opportunity", label: "Pipeline", group: "Operasional", crud: [...CRUD], custom: [] },
  { key: "order", label: "Review Pesanan", group: "Operasional", crud: ["view_any", "view", "update"], custom: ["confirm_order"] },
  { key: "target", label: "Target", group: "Operasional", crud: [...CRUD], custom: [] },
  { key: "discount", label: "Approval Diskon", group: "Approval", crud: ["view_any", "view"], custom: ["approve_discount"] },
  { key: "special_order", label: "Approval Pesanan Khusus", group: "Approval", crud: ["view_any", "view"], custom: ["approve_special_order"] },
  { key: "credit_override", label: "Approval Limit Kredit", group: "Approval", crud: ["view_any", "view"], custom: ["approve_credit_override"] },
  { key: "noo", label: "Approval Pelanggan Baru", group: "Approval", crud: ["view_any", "view"], custom: ["approve_noo"] },
  { key: "pipeline_stage", label: "Approval Tahap Pipeline", group: "Approval", crud: ["view_any", "view"], custom: ["approve_pipeline_stage"] },
  { key: "data", label: "Data (Sinkronisasi / Import-Export)", group: "Administrasi", crud: ["view_any"], custom: ["sync_data", "import_data", "export_data"] },
  { key: "user", label: "Pengguna", group: "Administrasi", crud: [...CRUD], custom: [] },
  { key: "role", label: "Role & Permission", group: "Administrasi", crud: [...CRUD], custom: [] },
  { key: "setting", label: "Pengaturan", group: "Administrasi", crud: ["view_any", "update"], custom: [] },
];

export function allPermissions(): string[] {
  return RESOURCES.flatMap((r) => [...r.crud.map((a) => `${a}_${r.key}`), ...r.custom]);
}

export const ROLE_META: Record<RoleKey, { label: string; scope: ScopeType; scopeLabel: string; desc: string }> = {
  admin: { label: "Admin", scope: "all", scopeLabel: "Semua cabang", desc: "Kelola pengguna, role, permission, data dan pengaturan modul" },
  cd: { label: "Commercial Director", scope: "all", scopeLabel: "Semua cabang + HQ", desc: "Dashboard nasional, approval diskon & pesanan khusus tertinggi" },
  bm: { label: "Branch Manager", scope: "branch", scopeLabel: "Cabang sendiri", desc: "Dashboard cabang, approval diskon s.d. 10%, target cabang" },
  spv: { label: "Sales SPV", scope: "team", scopeLabel: "Tim sendiri", desc: "Atur PJP tim, pipeline, approval diskon s.d. 5% dan NOO" },
  sales_admin: { label: "Sales Admin", scope: "branch", scopeLabel: "Cabang sendiri", desc: "Review pesanan dari lapangan, import / export data" },
  finance: { label: "Finance & Accounting", scope: "all", scopeLabel: "Semua cabang", desc: "Approval limit kredit, data kredit NOO, piutang" },
};

export const ROLE_ORDER: RoleKey[] = ["admin", "cd", "bm", "spv", "sales_admin", "finance"];

const p = (res: string, actions: string[]) => actions.map((a) => `${a}_${res}`);
const VIEW = ["view_any", "view"];

export function defaultPermissions(): Record<RoleKey, string[]> {
  return {
    admin: allPermissions(),
    cd: [
      "view_any_dashboard",
      ...p("pjp", VIEW),
      ...p("outlet", VIEW), "export_outlet",
      ...p("opportunity", VIEW),
      ...p("order", VIEW),
      ...p("target", [...CRUD]),
      ...p("discount", VIEW), "approve_discount",
      ...p("special_order", VIEW), "approve_special_order",
      ...p("credit_override", VIEW), "approve_credit_override",
      ...p("noo", VIEW),
      ...p("pipeline_stage", VIEW), "approve_pipeline_stage",
      "view_any_data", "export_data",
      "view_any_setting",
    ],
    bm: [
      "view_any_dashboard",
      ...p("pjp", ["view_any", "view", "update"]), "publish_pjp",
      ...p("outlet", ["view_any", "view", "create", "update"]), "export_outlet",
      ...p("opportunity", [...CRUD]),
      ...p("order", VIEW),
      ...p("target", ["view_any", "view", "create", "update"]),
      ...p("discount", VIEW), "approve_discount",
      ...p("special_order", VIEW), "approve_special_order",
      ...p("credit_override", VIEW), "approve_credit_override",
      ...p("noo", VIEW),
      ...p("pipeline_stage", VIEW), "approve_pipeline_stage",
    ],
    spv: [
      "view_any_dashboard",
      ...p("pjp", [...CRUD]), "publish_pjp",
      ...p("outlet", ["view_any", "view", "create", "update"]),
      ...p("opportunity", [...CRUD]),
      ...p("order", VIEW),
      ...p("target", VIEW),
      ...p("discount", VIEW), "approve_discount",
      ...p("noo", VIEW), "approve_noo",
      ...p("pipeline_stage", VIEW), "approve_pipeline_stage",
    ],
    sales_admin: [
      "view_any_dashboard",
      ...p("pjp", VIEW),
      ...p("outlet", ["view_any", "view", "update"]), "import_outlet", "export_outlet",
      ...p("order", ["view_any", "view", "update"]), "confirm_order",
      "view_any_data", "sync_data", "import_data", "export_data",
    ],
    finance: [
      "view_any_dashboard",
      ...p("outlet", ["view_any", "view", "update"]), "export_outlet",
      ...p("order", VIEW),
      ...p("credit_override", VIEW), "approve_credit_override",
      ...p("noo", VIEW), "approve_noo",
      "view_any_data", "import_data", "export_data",
    ],
  };
}

export const APPROVAL_META: Record<ApprovalType, { label: string; short: string; resource: string; perm: string; desc: string }> = {
  discount: { label: "Approval Diskon", short: "Diskon", resource: "discount", perm: "approve_discount", desc: "Diskon di atas kewenangan Sales, berjenjang sesuai LOA (Level of Authority)." },
  special_order: { label: "Approval Pesanan Khusus", short: "Pesanan Khusus", resource: "special_order", perm: "approve_special_order", desc: "Harga di luar price list, produk non-katalog / proyek, atau TOP khusus. Disetujui BM lalu CD." },
  credit_override: { label: "Approval Kelonggaran Limit Kredit", short: "Limit Kredit", resource: "credit_override", perm: "approve_credit_override", desc: "Pesanan yang melebihi limit kredit pelanggan. Disetujui Finance atau BM." },
  noo: { label: "Approval Pelanggan Baru (NOO)", short: "Pelanggan Baru", resource: "noo", perm: "approve_noo", desc: "Registrasi pelanggan baru dari lapangan. SPV memeriksa data, Finance menetapkan limit kredit / TOP." },
  pipeline_stage: { label: "Approval Tahap Pipeline", short: "Tahap Pipeline", resource: "pipeline_stage", perm: "approve_pipeline_stage", desc: "Perpindahan tahap pipeline (hanya aktif jika diaktifkan di Pengaturan)." },
};
