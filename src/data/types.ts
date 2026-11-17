export type RoleKey = "admin" | "cd" | "bm" | "spv" | "sales_admin" | "finance";
export type Variant = "A" | "B";
export type ScopeType = "all" | "branch" | "team";

export interface Branch {
  id: string;
  name: string;
  city: string;
}

export interface Salesman {
  id: string;
  name: string;
  branchId: string;
  spvId: string;
  code: string;
}

export interface Spv {
  id: string;
  name: string;
  branchId: string;
}

export interface ModuleUser {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  branchId?: string;
  spvId?: string;
  active: boolean;
  syncedAt: string;
}

export type CustomerStatus = "baru" | "lama_beli" | "lama_belum";
export type OutletClass = "A" | "B" | "C";
export type Frequency = "F4" | "F2" | "F1";

export interface Outlet {
  id: string;
  code: string;
  name: string;
  owner: string;
  phone: string;
  address: string;
  city: string;
  branchId: string;
  salesId: string;
  status: CustomerStatus;
  cls: OutletClass;
  segment: string;
  creditLimit: number;
  outstanding: number;
  overdue: number;
  overdueDays: number;
  top: number; // term of payment days
  lastOrder?: string;
  odooRef?: string;
}

export interface UomPrice {
  uom: string;
  price: number;
  conv: number; // base units per uom
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  uoms: UomPrice[];
}

export interface PjpEntry {
  id: string;
  salesId: string;
  outletId: string;
  day: number; // 0 = Senin .. 5 = Sabtu
  freq: Frequency;
  weeks: number[]; // 1..4
}

export type OppStage = "Prospek" | "Dijadwalkan" | "Kunjungan & Negosiasi" | "Menang" | "Batal";
export type OppType = "Pelanggan Baru (NOO)" | "Pelanggan Lama – produk baru" | "Pelanggan Lama – proyek";
export type FollowKind = "Kunjungan" | "Telepon" | "Kirim penawaran";

export interface OppLog {
  at: string;
  by: string;
  text: string;
}

export interface Opportunity {
  id: string;
  name: string;
  contact: string;
  city: string;
  type: OppType;
  salesId: string;
  stage: OppStage;
  value: number;
  nextDate: string; // ISO date
  nextKind: FollowKind;
  batalReason?: string;
  note?: string;
  pendingStage?: OppStage;
  createdAt: string;
  log: OppLog[];
}

export type ApprovalType = "discount" | "special_order" | "credit_override" | "noo" | "pipeline_stage";

export interface ApprovalStep {
  label: string;
  roles: RoleKey[];
  status: "pending" | "approved" | "rejected" | "waiting";
  by?: string;
  at?: string;
  reason?: string;
}

export interface AuditEntry {
  at: string;
  by: string;
  role: string;
  action: string;
  permission?: string;
  reason?: string;
}

export interface ApprovalRequest {
  id: string;
  no: string;
  type: ApprovalType;
  title: string;
  salesId: string;
  outletName: string;
  amount: number;
  details: { label: string; value: string }[];
  steps: ApprovalStep[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  audit: AuditEntry[];
  orderId?: string;
  oppId?: string;
  discountPct?: number;
  toStage?: OppStage;
}

export interface OrderItem {
  productId: string;
  uom: string;
  qty: number;
  price: number;
}

export type OrderStatus =
  | "Menunggu Review"
  | "Menunggu Approval"
  | "Mengirim ke Odoo"
  | "Gagal Sinkron"
  | "SO Draft di Odoo"
  | "Dikonfirmasi"
  | "Diproses Gudang"
  | "Dikirim"
  | "Selesai"
  | "Ditolak";

export interface Order {
  id: string;
  no: string;
  outletId: string;
  salesId: string;
  date: string;
  items: OrderItem[];
  discountPct: number;
  status: OrderStatus;
  note?: string;
  soNumber?: string;
  approvedTypes: ApprovalType[];
  log: OppLog[];
}

export interface TargetRow {
  key: string; // salesId / branchId / productId
  month: string; // YYYY-MM
  target: number;
  actual: number;
}

export interface LoaTier {
  role: RoleKey;
  label: string;
  max: number | null; // null = di atas tier sebelumnya
}

export interface Settings {
  variant: Variant;
  pipelineStageApproval: boolean;
  existingCustomerPipeline: boolean;
  overdueDays: number;
  loa: LoaTier[];
}

export interface SyncDomain {
  key: string;
  name: string;
  direction: string;
  schedule: string;
  lastSync: string;
  records: number;
  status: "ok" | "error" | "running";
  errors: number;
}

export interface SyncError {
  id: string;
  domain: string;
  ref: string;
  message: string;
  at: string;
  resolved: boolean;
}

export interface ImportLog {
  id: string;
  kind: "Import" | "Export";
  template: string;
  file: string;
  by: string;
  at: string;
  accepted: number;
  rejected: number;
}

export interface Toast {
  id: number;
  title: string;
  desc?: string;
  tone?: "success" | "info" | "warning" | "danger";
}
