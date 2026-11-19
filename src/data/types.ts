/** D-52: v1 ships two built-in roles; more can be added as custom roles (Shield pattern). */
export type RoleKey = "admin" | "spv";
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

/** Role definition: 6 built-in roles + roles created in Setting → Role (module 12). */
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
/** Visits per 4-week cycle (one visit day): F1 = 1x, F2 = every 2 weeks, F4 = weekly. More than 1x/week = F4 + extra call. */
export type Frequency = "F1" | "F2" | "F4";

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
  /** D-51: days the outlet can be visited (0 = Senin .. 5 = Sabtu). Default all 6. */
  visitDays: number[];
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

/** One outlet in a salesman's PJP. Stored as frequency + week pattern + one visit day; calls per cycle = weeks. */
export interface PjpEntry {
  id: string;
  salesId: string;
  outletId: string;
  routeId?: string;
  /** Visit weekday, 0 = Senin .. 5 = Sabtu (exactly one day per entry). */
  day: number;
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

/** Module 04: PJP change request from Sales, decided by holders of `update_pjp` (data scope). */
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

/** D-54: a step is decided by permission, never by role name. Any user whose role holds `permission`
 *  (or one of `alsoPermissions`, e.g. a higher LOA tier) and whose data scope covers the request may act. */
export interface ApprovalStep {
  label: string;
  permission: string;
  alsoPermissions?: string[];
  /** NOO: this step sets credit limit / TOP / price group (step holding approve_noo_credit, else the last step). */
  setsCredit?: boolean;
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
  /** NOO step 2 (approve_noo_credit): credit data set by the approver. */
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

/** D-54: LOA tier = value band linked to a permission. First tier has no permission (Sales may give it without approval). */
export interface LoaTier {
  label: string;
  max: number | null; // null = di atas tier sebelumnya
  permission: string | null;
}

/** D-54: request types with a configurable multi-step chain (discount uses LOA tiers instead). */
export type ChainType = "special_order" | "noo" | "credit_override" | "pipeline_stage";
export interface ChainStep {
  label: string;
  permission: string;
}

export interface Settings {
  variant: Variant;
  pipelineStageApproval: boolean;
  /** AS-15: Batal needs approval by holders of approve_pipeline_stage (default on). */
  pipelineBatalApproval: boolean;
  existingCustomerPipeline: boolean;
  overdueDays: number;
  loa: LoaTier[];
  /** D-54: ordered approval steps per request type (each step = one permission), editable in Setting. */
  approvalChains: Record<ChainType, ChainStep[]>;
  /** Module 06 FR-002: approval requests created automatically on order ingest (PRD default) or manually from order review. */
  approvalTrigger: "auto" | "manual";
  /** Single covering tier (PRD default) or sequential through every tier below. */
  discountTierMode: "single" | "sequential";
  discountBasis: "line" | "order";
  slaHours: number;
  orderReview: boolean;
  orderWithoutVisitHQ: boolean;
  nooOrderBeforeApproval: boolean;
  minOrder: boolean;
  geofenceM: number;
  /** D-48: default frequency for new PJP entries / generate (frequency lives only on the PJP entry). */
  defaultFreq: Frequency;
  /** PJP capacity: target calls per day (B2B plastics 10-15; FMCG typically 20-30). */
  pjpCallTarget: number;
  /** Hard warning above this number of calls per day. */
  pjpMaxCalls: number;
  /** HQ Direct Sales (key account channel) has its own capacity. */
  hqCallTarget: number;
  hqMaxCalls: number;
  /** Default visit minutes per outlet + travel minutes between outlets (estimated day duration). */
  visitMinutes: number;
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
  changeRequestSlaHours: number;
  /** Auto-generate parameters. */
  generateKeepRoute: boolean;
  routeStartPoint: "branch" | "home";
  /** Daily call plan push reminder (HH:MM). */
  reminderTime: string;
  /** Bypass: holders of update_pjp edit a published PJP directly without a change request (default off). */
  spvEditPjpDirect: boolean;
  /** D-54: PJP needs approval by holders of approve_pjp before publish (default off: holders of publish_pjp publish directly). */
  pjpApprovalRequired: boolean;
  /** Module 02 assortment: segment without assortment offers all active products ("all") or nothing ("none"). */
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

/** Module 02: products offered per segment (channel); mustSell = checked on every visit / order. */
export interface AssortmentItem {
  productId: string;
  mustSell: boolean;
}
export interface Assortment {
  id: string;
  segment: string;
  items: AssortmentItem[];
  updatedBy?: string;
  updatedAt?: string;
}
/** Per-outlet exception on top of the segment assortment (key accounts). */
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
