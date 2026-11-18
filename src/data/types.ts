export type RoleKey = "admin" | "cd" | "bm" | "spv" | "sales_admin" | "finance";
export type Variant = "A" | "B";
export type ScopeType = "all" | "branch" | "team";

export interface Branch {
  id: string; // also the branch code used in document numbers (SO-<branch>-..., C-<branch>-...)
  name: string;
  city: string;
  regionId?: string;
  active?: boolean;
}

/** Module 03: territory master (PRD-only pages). */
export interface Region {
  id: string;
  name: string;
  branchIds: string[];
  active: boolean;
}

/** Route / beat: a group of outlets of one salesman visited in sequence, normally on one weekday (module 03 + 04). */
export interface Route {
  id: string;
  code: string;
  name: string;
  branchId: string;
  salesId?: string;
  area: string;
  active: boolean;
  /** Default weekday of the beat (0 = Senin .. 5 = Sabtu); PJP generate uses it as the visit day. */
  day?: number;
}

/** Module 02: price list per channel / region (PRD-only page). */
export interface PriceListItem {
  productId: string;
  uom: string;
  price: number;
}

export interface PriceList {
  id: string;
  name: string;
  channel: string; // = price group used on the outlet
  regionId: string | "all";
  validFrom: string;
  validTo?: string;
  active: boolean;
  items: PriceListItem[];
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

/** Role definition: 6 built-in roles + roles created in Pengguna & Role (module 12). */
export interface RoleDef {
  key: string;
  label: string;
  scope: ScopeType;
  scopeLabel: string;
  desc: string;
  builtin: boolean;
}

export interface ModuleUser {
  id: string;
  name: string;
  email: string;
  /** null = synced from MileApp, no role assigned yet (no access until an Admin assigns one). */
  role: string | null;
  branchId?: string;
  spvId?: string;
  active: boolean;
  syncedAt: string;
}

export type CustomerStatus = "baru" | "lama_beli" | "lama_belum";
export type OutletClass = "A" | "B" | "C";
/** Visits per 4-week cycle: F1 = 1x, F2 = every 2 weeks, F4 = weekly, F8 = 2x/week, F12 = 3x/week. */
export type Frequency = "F1" | "F2" | "F4" | "F8" | "F12";

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
  /** false = deactivated (outlet with transactions is never deleted physically). */
  active: boolean;
  gps?: { lat: number; lng: number };
  npwp?: string;
  pkp: boolean;
  priceGroup: string;
  routeId?: string;
  /** Visit order within the route (1 = first stop). */
  routeSeq?: number;
  /** Per-outlet frequency override (e.g. key accounts F8 / F12); empty = class default from Pengaturan. */
  visitFreq?: Frequency;
  source: "odoo" | "import" | "noo" | "manual";
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
  uoms: UomPrice[]; // uoms[0] = base UoM
  active?: boolean;
}

/** One outlet in a salesman's PJP. Stored as frequency + week pattern + visit days; calls per cycle = weeks x days. */
export interface PjpEntry {
  id: string;
  salesId: string;
  outletId: string;
  routeId?: string;
  /** Visit weekdays, 0 = Senin .. 5 = Sabtu (F8: 2 days, F12: 3 days, otherwise 1). */
  days: number[];
  freq: Frequency;
  weeks: number[]; // 1..4 within the 4-week cycle
  seq: number; // visit order within the day (route sequence)
  validFrom: string;
  validTo?: string;
}

/** PJP header per salesman: version, status and validity (module 04 FR-005, FR-013). */
export interface PjpHeader {
  salesId: string;
  version: number;
  status: "Draft" | "Menunggu Approval" | "Disetujui" | "Dipublikasikan";
  validFrom: string;
  validTo?: string;
  publishedAt?: string;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectReason?: string;
  note?: string;
}

/** Holiday calendar entry (national or per branch). */
export interface Holiday {
  date: string;
  name: string;
  branchIds?: string[];
}

/** Date-specific move of a planned day (e.g. holiday) to another date, without changing the PJP pattern. */
export interface PjpShift {
  salesId: string;
  from: string;
  to: string;
}

/** Module 04: PJP change request from Sales / BM, decided by SPV with `update_pjp`. */
export interface PjpChangeRequest {
  id: string;
  salesId: string;
  outletId: string;
  kind: "Tambah" | "Hapus" | "Ubah hari";
  detail: string;
  reason: string;
  requestedBy: string;
  at: string;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
  decisionReason?: string;
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
  /** NOO prospect outlet (status Pelanggan Baru) created at Prospek, or the existing customer. */
  outletId?: string;
  wonOrderId?: string;
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
  outletId?: string;
  /** NOO step 2: credit data set by Finance. */
  nooCredit?: { limit: number; top: number; priceGroup: string };
}

export interface OrderItem {
  productId: string;
  uom: string;
  qty: number;
  price: number;
}

/** Module 07 state machine. A: ... → SO Draft di Odoo → Dikonfirmasi di Odoo / Dibatalkan (read-back).
 *  B: ... → Dikonfirmasi → Diproses → Selesai, or Dibatalkan. Delivery is out of scope. */
export type OrderStatus =
  | "Menunggu Review"
  | "Menunggu Approval"
  | "Mengirim ke Odoo"
  | "Gagal Sinkron"
  | "SO Draft di Odoo"
  | "Dikonfirmasi di Odoo"
  | "Dikonfirmasi"
  | "Diproses"
  | "Selesai"
  | "Dibatalkan"
  | "Ditolak";

export interface Order {
  id: string;
  no: string; // SO-<branch>-<yyyymm>-<seq>
  mfRef: string; // client order id from Mile Field (idempotency key, reference only)
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
  key: string; // salesId / branchId / productId / category
  month: string; // YYYY-MM
  target: number;
  actual: number;
  targetQty?: number; // base UoM
  actualQty?: number;
}

export interface TargetChange {
  at: string;
  by: string;
  level: string;
  key: string;
  month: string;
  field: "nilai" | "qty";
  from: number;
  to: number;
  source: "layar" | "import";
}

export interface LoaTier {
  role: RoleKey;
  label: string;
  max: number | null; // null = di atas tier sebelumnya
}

export interface Settings {
  variant: Variant;
  pipelineStageApproval: boolean;
  /** AS-15: Batal needs SPV approval (default on). */
  pipelineBatalApproval: boolean;
  existingCustomerPipeline: boolean;
  overdueDays: number;
  loa: LoaTier[];
  /** Module 06 FR-002: approval requests created automatically on order ingest (PRD default) or by Sales Admin. */
  approvalTrigger: "auto" | "manual";
  /** Single covering tier (PRD default) or sequential through every tier below. */
  discountTierMode: "single" | "sequential";
  discountBasis: "line" | "order";
  creditApprover: "finance_or_bm" | "finance" | "bm";
  slaHours: number;
  salesAdminReview: boolean;
  orderWithoutVisitHQ: boolean;
  nooOrderBeforeFinance: boolean;
  minOrder: boolean;
  geofenceM: number;
  classFreq: Record<OutletClass, Frequency>;
  /** PJP capacity: target calls per day (B2B plastics 10-15; FMCG typically 20-30). */
  pjpCallTarget: number;
  /** Hard warning above this number of calls per day. */
  pjpMaxCalls: number;
  /** HQ Direct Sales (key account channel) has its own capacity. */
  hqCallTarget: number;
  hqMaxCalls: number;
  /** Standard visit minutes per outlet class + travel minutes between outlets (estimated day duration). */
  classVisitMinutes: Record<OutletClass, number>;
  travelMinutes: number;
  /** PJP cycle (weeks) and working days (0 = Senin .. 5 = Sabtu), with per-branch override. */
  cycleWeeks: number;
  workDays: number[];
  branchWorkDays: Record<string, number[]>;
  /** Check-in / visit rules (Mile Field Flow). */
  geofenceMode: "flag" | "block";
  photoRequired: boolean;
  minVisitMinutes: number;
  checkoutRequired: boolean;
  /** Extra call policy. */
  extraCallAllowed: boolean;
  extraCallNeedsReason: boolean;
  extraInCompliance: boolean;
  /** Skip reasons master + reschedule / carry-over. */
  skipReasons: string[];
  carryOverMode: "manual" | "auto" | "off";
  carryOverMaxDays: number;
  /** Publish / lock and change-request rules. */
  publishCutoff: string;
  lockAfterPublish: boolean;
  changeApprover: "spv" | "spv_bm";
  changeRequestSlaHours: number;
  /** Auto-generate parameters. */
  generateBalanceBy: "count" | "duration";
  generateKeepRoute: boolean;
  routeStartPoint: "branch" | "home";
  /** Daily call plan push reminder (HH:MM). */
  reminderTime: string;
  belumBeliFreq: Frequency;
  /** Bypass: SPV / Admin edit PJP langsung tanpa approval (default off). */
  spvEditPjpDirect: boolean;
  /** Who approves a PJP before publish (permission approve_pjp). "regional" = Regional Manager (CD). */
  pjpApprover: "bm" | "spv" | "regional";
  /** Module 02 assortment: segment x class without assortment offers all active products ("all") or nothing ("none"). */
  assortmentFallback: "all" | "none";
  /** Module 03 plotting, Varian A: write the outlet owner back to Odoo (res.partner.user_id). */
  odooWriteBackSalesperson: boolean;
}

export interface AuditLogEntry {
  at: string;
  by: string;
  module: string;
  action: string;
  target: string;
  detail?: string;
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

/** Module 02: products offered per segment (channel) x outlet class; mustSell = checked on every visit / order. */
export interface AssortmentItem {
  productId: string;
  mustSell: boolean;
}
export interface Assortment {
  id: string;
  segment: string;
  cls: OutletClass;
  items: AssortmentItem[];
  updatedBy?: string;
  updatedAt?: string;
}
/** Per-outlet exception on top of the segment x class assortment (key accounts). */
export interface AssortmentException {
  id: string;
  outletId: string;
  productId: string;
  kind: "include" | "exclude";
  mustSell?: boolean;
}

/** Module 03: outlet ownership change (plotting) history. */
export interface OwnershipLog {
  id: string;
  outletId: string;
  fromSalesId?: string;
  toSalesId: string;
  fromRouteId?: string;
  toRouteId?: string;
  effective: string;
  reason: string;
  by: string;
  at: string;
}
