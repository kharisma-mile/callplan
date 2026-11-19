import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import * as M from "@/data/mock";
import type {
  Assortment,
  AssortmentException,
  OwnershipLog,
  ApprovalRequest,
  ApprovalType,
  AuditEntry,
  AuditLogEntry,
  Branch,
  ImportLog,
  ModuleUser,
  Opportunity,
  OppStage,
  Order,
  Outlet,
  OrderStatus,
  PjpChangeRequest,
  PjpEntry,
  PjpHeader,
  PjpShift,
  PriceList,
  Product,
  Region,
  RoleDef,
  Route,
  Settings,
  SyncDomain,
  SyncError,
  TargetChange,
  TargetRow,
  Toast,
} from "@/data/types";
import { APPROVAL_META, ROLE_META, ROLE_ORDER, defaultPermissions } from "@/lib/rbac";
import { buildSteps, checkOrder, orderTotal, stepPerms, stepTitle } from "@/lib/approval";
import { nowStamp, rupiah } from "@/lib/format";
import { weeksFor } from "@/data/pjp-engine";

const PREFIX: Record<ApprovalType, string> = {
  discount: "APV-DSK",
  special_order: "APV-PK",
  credit_override: "APV-KRD",
  noo: "APV-NOO",
  pipeline_stage: "APV-PIP",
};

const salesOf = (id: string) => M.SALESMEN.find((s) => s.id === id)!;
const outletOf = (outlets: Outlet[], id: string) => outlets.find((o) => o.id === id)!;

function makeApproval(
  type: ApprovalType,
  base: Omit<ApprovalRequest, "id" | "no" | "type" | "steps" | "status" | "audit" | "createdAt"> & { createdAt?: string },
  settings: Settings,
  by: string
): ApprovalRequest {
  const { id, no } = M.nextApprovalNo(PREFIX[type]);
  const createdAt = base.createdAt ?? nowStamp();
  return {
    ...base,
    id,
    no,
    type,
    createdAt,
    status: "pending",
    steps: buildSteps(type, { discountPct: base.discountPct, settings }),
    audit: [{ at: createdAt, by, role: "Sales", action: "Permintaan dibuat" }],
  };
}

function nooDetails(opp: Opportunity) {
  return [
    { label: "Pemilik", value: opp.contact || "—" },
    { label: "Alamat + GPS", value: `${opp.city} · -7.2575, 112.7521 (check-in Mile Field)` },
    { label: "Dokumen", value: "Foto toko, KTP (NPWP: non-PKP)" },
    { label: "Segmen usulan", value: "Horeka" },
    { label: "Hari kunjungan", value: "Semua hari (Senin–Sabtu)" },
    { label: "Limit diminta", value: rupiah(15_000_000) + " · TOP 14 hari" },
  ];
}

/** Prospect outlet for an NOO (status Pelanggan Baru until the NOO is approved). Pushed into M.OUTLETS at seed time. */
function nooOutletFor(opp: Opportunity, into: Outlet[] = M.OUTLETS): Outlet {
  const seq = M.nextOutletSeq();
  const s = salesOf(opp.salesId);
  const o: Outlet = {
    id: `O${seq}`,
    code: `C-${s.branchId}-${String(seq).padStart(4, "0")}`,
    name: opp.name,
    owner: opp.contact,
    phone: "0812-0000-0000",
    address: "Alamat dari registrasi NOO",
    city: opp.city,
    branchId: s.branchId,
    salesId: s.id,
    status: "baru",
    segment: "Horeka",
    creditLimit: 0,
    outstanding: 0,
    overdue: 0,
    overdueDays: 0,
    top: 0,
    active: true,
    gps: { lat: -7.2575, lng: 112.7521 },
    pkp: false,
    priceGroup: "Retail",
    visitDays: [0, 1, 2, 3, 4, 5],
    source: "noo",
  };
  into.unshift(o);
  return o;
}

/** Module 06 FR-002: one request per failing check per order (types run in parallel). */
export function orderApprovalBase(type: ApprovalType, order: Order, outlet: Outlet): Parameters<typeof makeApproval>[1] {
  const total = orderTotal(order);
  return {
    title:
      type === "discount"
        ? `Diskon ${order.discountPct}% untuk ${order.no}`
        : type === "credit_override"
          ? `Melebihi limit kredit – ${outlet.name}`
          : `Harga di luar price list – ${order.no}`,
    salesId: order.salesId,
    outletName: outlet.name,
    amount: total,
    orderId: order.id,
    discountPct: type === "discount" ? order.discountPct : undefined,
    createdAt: order.date,
    details:
      type === "credit_override"
        ? [
            { label: "Pesanan", value: order.no },
            { label: "Limit kredit", value: rupiah(outlet.creditLimit) },
            { label: "Saldo piutang", value: rupiah(outlet.outstanding) },
            { label: "Setelah pesanan", value: rupiah(outlet.outstanding + total) },
            { label: "Jatuh tempo", value: outlet.overdueDays ? `${rupiah(outlet.overdue)} · ${outlet.overdueDays} hari` : "—" },
          ]
        : [
            { label: "Pesanan", value: order.no },
            { label: "Catatan sales", value: order.note ?? "—" },
          ],
  };
}

export function orderNeeds(order: Order, outlet: Outlet, settings: Settings): ApprovalType[] {
  return checkOrder(order, outlet, settings)
    .filter((c) => c.needs)
    .map((c) => c.needs!);
}

/* ---------------- initial approvals ---------------- */
function seedApprovals(orders: Order[], opps: Opportunity[], settings: Settings): ApprovalRequest[] {
  const list: ApprovalRequest[] = [];
  const sby1 = M.SALESMEN.filter((s) => s.spvId === "SPV-SBY-1");
  const sby2 = M.SALESMEN.filter((s) => s.spvId === "SPV-SBY-2");
  const jkt = M.SALESMEN.filter((s) => s.branchId === "JKT");
  const outletFor = (salesId: string, i = 0) => M.OUTLETS.filter((o) => o.salesId === salesId)[i];

  // PRD default (approvalTrigger = auto): every incoming order with failing checks is routed to approval on ingest
  if (settings.approvalTrigger === "auto") {
    orders.forEach((o) => {
      if (o.status !== "Menunggu Review") return;
      const outlet = outletOf(M.OUTLETS, o.outletId);
      const needs = orderNeeds(o, outlet, settings);
      if (!needs.length) return;
      needs.forEach((t) => list.push(makeApproval(t, orderApprovalBase(t, o, outlet), settings, salesOf(o.salesId).name)));
      o.status = "Menunggu Approval";
      o.log = [...o.log, { at: o.date, by: "Sistem", text: `Cek otomatis gagal → diajukan: ${needs.map((t) => APPROVAL_META[t].short).join(", ")}` }];
    });
  }

  const disc = (salesId: string, pctV: number, reason: string, at: string, outletIdx = 0) => {
    const o = outletFor(salesId, outletIdx);
    const value = 1_000_000 * (20 + outletIdx * 7 + Math.round(pctV));
    list.push(
      makeApproval(
        "discount",
        {
          title: `Diskon ${pctV}% – ${o.name}`,
          salesId,
          outletName: o.name,
          amount: value,
          discountPct: pctV,
          createdAt: at,
          details: [
            { label: "Produk", value: "Kantong Plastik HD 24x40 (karton)" },
            { label: "Alasan", value: reason },
          ],
        },
        settings,
        salesOf(salesId).name
      )
    );
  };
  disc(sby1[0].id, 4, "Kompetitor menawarkan harga lebih rendah", "2026-11-17 09:05", 1);
  disc(sby1[2].id, 4.5, "Pembelian volume 50 karton", "2026-11-16 15:20", 0);
  disc(sby2[0].id, 8, "Program akhir tahun outlet key account", "2026-11-16 13:10", 0);
  disc(jkt[1].id, 12, "Tender kemasan restoran (6 bulan)", "2026-11-15 10:30", 0);

  // special order (2 steps)
  const so = (salesId: string, title: string, amount: number, at: string, firstApproved?: string) => {
    const o = outletFor(salesId, 0);
    const r = makeApproval(
      "special_order",
      {
        title,
        salesId,
        outletName: o.name,
        amount,
        createdAt: at,
        details: [
          { label: "Jenis", value: "Produk non-katalog / proyek" },
          { label: "TOP diminta", value: "45 hari" },
        ],
      },
      settings,
      salesOf(salesId).name
    );
    if (firstApproved) {
      r.steps[0] = { ...r.steps[0], status: "approved", by: firstApproved, at: "2026-11-16 11:00", reason: "Margin masih aman" };
      r.steps[1] = { ...r.steps[1], status: "pending" };
      r.audit.push({ at: "2026-11-16 11:00", by: firstApproved, role: "Sales Supervisor", action: "Disetujui (tahap 1)", permission: "approve_special_order", reason: "Margin masih aman" });
    }
    list.push(r);
  };
  so(sby1[1].id, "Cetak logo custom thinwall 500 ml (proyek katering)", 86_000_000, "2026-11-17 07:55");
  so(M.SALESMEN.find((s) => s.branchId === "BDG")!.id, "Kantong HD ukuran khusus 60x90 untuk pabrik", 142_000_000, "2026-11-15 14:00", M.SPVS.find((s) => s.branchId === "BDG")?.name ?? "Sales Supervisor");

  // credit override
  const cr = (salesId: string, at: string, idx = 0) => {
    const o = outletFor(salesId, idx);
    list.push(
      makeApproval(
        "credit_override",
        {
          title: `Melebihi limit kredit – ${o.name}`,
          salesId,
          outletName: o.name,
          amount: 18_500_000,
          createdAt: at,
          details: [
            { label: "Limit kredit", value: rupiah(o.creditLimit || 30_000_000) },
            { label: "Saldo piutang", value: rupiah(o.outstanding || 26_000_000) },
            { label: "Kelebihan", value: rupiah(14_500_000) },
          ],
        },
        settings,
        salesOf(salesId).name
      )
    );
  };
  cr(sby2[1].id, "2026-11-17 09:30");
  cr(jkt[2].id, "2026-11-16 16:45", 1);

  // NOO: registered from Mile Field at Prospek → prospect outlet (Pelanggan Baru) + NOO request (approve_noo → approve_noo_credit)
  const noo = (opp: Opportunity, at: string, spvDone?: string) => {
    const outlet = nooOutletFor(opp);
    opp.outletId = outlet.id;
    const r = makeApproval(
      "noo",
      {
        title: `Pelanggan baru: ${opp.name}`,
        salesId: opp.salesId,
        outletName: opp.name,
        amount: opp.value,
        oppId: opp.id,
        outletId: outlet.id,
        createdAt: at,
        details: nooDetails(opp),
      },
      settings,
      salesOf(opp.salesId).name
    );
    if (spvDone) {
      r.steps[0] = { ...r.steps[0], status: "approved", by: spvDone, at: "2026-11-16 10:10", reason: "Data lengkap" };
      r.steps[1] = { ...r.steps[1], status: "pending" };
      r.audit.push({ at: "2026-11-16 10:10", by: spvDone, role: "Sales Supervisor", action: "Disetujui (tahap 1)", permission: "approve_noo", reason: "Data lengkap" });
    }
    list.push(r);
  };
  const early = opps.filter((o) => o.type === "Pelanggan Baru (NOO)" && (o.stage === "Prospek" || o.stage === "Dijadwalkan"));
  const sbyEarly = early.filter((o) => salesOf(o.salesId).spvId === "SPV-SBY-1");
  if (sbyEarly[0]) noo(sbyEarly[0], "2026-11-17 08:20");
  if (sbyEarly[1]) noo(sbyEarly[1], "2026-11-16 09:00", "Dewi Lestari");
  if (sbyEarly[2]) noo(sbyEarly[2], "2026-11-16 08:30");
  const otherEarly = early.find((o) => salesOf(o.salesId).branchId !== "SBY");
  if (otherEarly) noo(otherEarly, "2026-11-16 14:30");

  return list;
}

function monthsTargets(rows: TargetRow[]): TargetRow[] {
  return [
    ...rows.map((r) => ({ ...r, month: "2026-10", actual: Math.round(r.target * 0.93), actualQty: r.targetQty ? Math.round(r.targetQty * 0.93) : undefined })),
    ...rows,
    ...rows.map((r) => ({
      ...r,
      month: "2026-12",
      target: Math.round((r.target * 1.1) / 1_000_000) * 1_000_000,
      actual: 0,
      targetQty: r.targetQty ? Math.round(r.targetQty * 1.1) : undefined,
      actualQty: r.targetQty ? 0 : undefined,
    })),
  ];
}

/* ---------------- context ---------------- */
/** D-52: no module login; the user arrives signed in from MileApp (session hand-off). */
interface Session {
  userId: string;
  role: string;
}

/** Default persona when opened from MileApp: Sales Supervisor Dewi Lestari (Cabang Surabaya · Tim Dewi). */
const DEFAULT_USER_ID = "U4";

const NO_ROLE: RoleDef = { key: "", label: "Tanpa role", scope: "team", scopeLabel: "Tidak ada akses", desc: "Belum ada role (ditetapkan pemegang update_user)", builtin: false };

export interface AppState {
  session: Session;
  user: ModuleUser | null;
  permissions: Record<string, string[]>;
  roles: RoleDef[];
  settings: Settings;
  products: Product[];
  priceLists: PriceList[];
  branches: Branch[];
  regions: Region[];
  routes: Route[];
  pjpRequests: PjpChangeRequest[];
  targetLog: TargetChange[];
  auditLog: AuditLogEntry[];
  outlets: Outlet[];
  pjp: PjpEntry[];
  pjpHeaders: PjpHeader[];
  pjpShifts: PjpShift[];
  opps: Opportunity[];
  orders: Order[];
  approvals: ApprovalRequest[];
  targets: { sales: TargetRow[]; branch: TargetRow[]; product: TargetRow[]; category: TargetRow[] };
  users: ModuleUser[];
  syncDomains: SyncDomain[];
  syncErrors: SyncError[];
  importLogs: ImportLog[];
  toasts: Toast[];
  assortments: Assortment[];
  assortmentExceptions: AssortmentException[];
  ownershipLog: OwnershipLog[];
}

export interface ReassignInput {
  outletIds: string[];
  toSalesId: string;
  toRouteId?: string;
  effective: string;
  reason: string;
}

interface Actions {
  /** Demo only: switch persona (Admin / Sales Supervisor). */
  switchUser: (userId: string) => void;
  can: (perm: string) => boolean;
  inScope: (salesId: string) => boolean;
  scopeSalesIds: string[];
  scopeLabel: string;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  setPermissions: (fn: (p: Record<string, string[]>) => Record<string, string[]>) => void;
  setRoles: (fn: (r: RoleDef[]) => RoleDef[]) => void;
  roleMeta: (key: string | null | undefined) => RoleDef;
  setProducts: (fn: (p: Product[]) => Product[]) => void;
  setPriceLists: (fn: (p: PriceList[]) => PriceList[]) => void;
  setBranches: (fn: (p: Branch[]) => Branch[]) => void;
  setRegions: (fn: (p: Region[]) => Region[]) => void;
  setRoutes: (fn: (p: Route[]) => Route[]) => void;
  setPjpRequests: (fn: (p: PjpChangeRequest[]) => PjpChangeRequest[]) => void;
  setTargetLog: (fn: (p: TargetChange[]) => TargetChange[]) => void;
  addAudit: (e: Omit<AuditLogEntry, "at" | "by">) => void;
  submitOrderApprovals: (orderId: string, override?: Order) => ApprovalType[];
  simulateIncomingOrder: () => void;
  setOrderStatus: (orderId: string, status: OrderStatus, text: string) => void;
  createOpp: (opp: Opportunity) => void;
  setSettings: (fn: (s: Settings) => Settings) => void;
  setOutlets: (fn: (o: Outlet[]) => Outlet[]) => void;
  setPjp: (fn: (p: PjpEntry[]) => PjpEntry[]) => void;
  setPjpHeaders: (fn: (p: PjpHeader[]) => PjpHeader[]) => void;
  setPjpShifts: (fn: (p: PjpShift[]) => PjpShift[]) => void;
  setOpps: (fn: (o: Opportunity[]) => Opportunity[]) => void;
  setOrders: (fn: (o: Order[]) => Order[]) => void;
  setTargets: (fn: (t: AppState["targets"]) => AppState["targets"]) => void;
  setUsers: (fn: (u: ModuleUser[]) => ModuleUser[]) => void;
  setSyncDomains: (fn: (d: SyncDomain[]) => SyncDomain[]) => void;
  setSyncErrors: (fn: (d: SyncError[]) => SyncError[]) => void;
  setImportLogs: (fn: (d: ImportLog[]) => ImportLog[]) => void;
  createApproval: (type: ApprovalType, base: Parameters<typeof makeApproval>[1]) => ApprovalRequest;
  decideApproval: (id: string, approve: boolean, reason: string, extra?: { nooCredit?: ApprovalRequest["nooCredit"] }) => void;
  canActOnStep: (a: ApprovalRequest) => boolean;
  moveOpp: (oppId: string, stage: OppStage, batalReason?: string) => void;
  setAssortments: (fn: (a: Assortment[]) => Assortment[]) => void;
  setAssortmentExceptions: (fn: (a: AssortmentException[]) => AssortmentException[]) => void;
  /** Module 03 plotting: move outlets to another salesman (PJP entries move as Draft, open pipeline follows). */
  reassignOutlets: (inp: ReassignInput) => { moved: number; pjpMoved: number; oppsMoved: number };
  /** Module 02: products offered to an outlet (segment assortment + exceptions). */
  assortmentFor: (outlet: Outlet) => { items: { productId: string; mustSell: boolean; source: "assortment" | "include" | "fallback" }[]; fallback: boolean };
}

const Ctx = createContext<(AppState & Actions) | null>(null);

let SEED: { orders: Order[]; opps: Opportunity[]; approvals: ApprovalRequest[]; outlets: Outlet[] } | null = null;
function seed() {
  if (!SEED) {
    const orders = M.ORDERS.map((o) => ({ ...o }));
    const opps = M.OPPORTUNITIES.map((o) => ({ ...o }));
    const approvals = seedApprovals(orders, opps, M.DEFAULT_SETTINGS);
    SEED = { orders, opps, approvals, outlets: [...M.OUTLETS] };
  }
  return SEED;
}

const BUILTIN_ROLES: RoleDef[] = ROLE_ORDER.map((k) => ROLE_META[k]);

export function AppProvider({ children }: { children: ReactNode }) {
  const init = useRef(seed());
  const [session, setSession] = useState<Session>({ userId: DEFAULT_USER_ID, role: "spv" });
  const [permissions, setPermissions] = useState<Record<string, string[]>>(defaultPermissions);
  const [roles, setRoles] = useState<RoleDef[]>(BUILTIN_ROLES);
  const [settings, setSettings] = useState<Settings>(M.DEFAULT_SETTINGS);
  const [outlets, setOutlets] = useState<Outlet[]>(init.current.outlets);
  const [pjp, setPjp] = useState<PjpEntry[]>(M.PJP);
  const [pjpHeaders, setPjpHeaders] = useState<PjpHeader[]>(M.PJP_HEADERS);
  const [pjpShifts, setPjpShifts] = useState<PjpShift[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>(init.current.opps);
  const [orders, setOrders] = useState<Order[]>(init.current.orders);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(init.current.approvals);
  const [targets, setTargets] = useState({
    sales: monthsTargets(M.TARGETS_SALES),
    branch: monthsTargets(M.TARGETS_BRANCH),
    product: monthsTargets(M.TARGETS_PRODUCT),
    category: monthsTargets(M.TARGETS_CATEGORY),
  });
  const [users, setUsers] = useState<ModuleUser[]>(M.USERS);
  const [syncDomains, setSyncDomains] = useState(M.SYNC_DOMAINS);
  const [syncErrors, setSyncErrors] = useState(M.SYNC_ERRORS);
  const [importLogs, setImportLogs] = useState(M.IMPORT_LOGS);
  const [products, setProducts] = useState<Product[]>(M.PRODUCTS);
  const [priceLists, setPriceLists] = useState<PriceList[]>(M.PRICE_LISTS);
  const [branches, setBranches] = useState<Branch[]>(M.BRANCHES);
  const [regions, setRegions] = useState<Region[]>(M.REGIONS);
  const [routes, setRoutes] = useState<Route[]>(M.ROUTES);
  const [pjpRequests, setPjpRequests] = useState<PjpChangeRequest[]>(M.PJP_REQUESTS);
  const [targetLog, setTargetLog] = useState<TargetChange[]>([
    { at: "2026-11-03 09:15", by: "Rina Kusuma", level: "Cabang", key: "SBY", month: "2026-11", field: "nilai", from: 0, to: M.TARGETS_BRANCH.find((t) => t.key === "SBY")!.target, source: "import" },
  ]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([
    { at: "2026-11-17 06:00", by: "Sistem", module: "Pengguna", action: "Sinkron pengguna MileApp", target: "Semua", detail: "0 pengguna baru, 0 dinonaktifkan" },
    { at: "2026-11-16 15:12", by: "Rina Kusuma", module: "Role", action: "Permission diubah", target: "Sales Supervisor", detail: "+ approve_pipeline_stage" },
    { at: "2026-11-14 10:03", by: "Rina Kusuma", module: "Pengaturan", action: "Pengaturan disimpan", target: "Tier LOA diskon", detail: "Tier 1 (approve_discount_tier_1) 4% → 5%" },
  ]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [assortments, setAssortments] = useState<Assortment[]>(M.ASSORTMENTS);
  const [assortmentExceptions, setAssortmentExceptions] = useState<AssortmentException[]>(M.ASSORTMENT_EXCEPTIONS);
  const [ownershipLog, setOwnershipLog] = useState<OwnershipLog[]>(M.OWNERSHIP_LOG);

  const user = users.find((u) => u.id === session.userId) ?? null;

  const roleMeta = useCallback((key: string | null | undefined) => (key ? roles.find((r) => r.key === key) ?? NO_ROLE : NO_ROLE), [roles]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const addAudit = useCallback(
    (e: Omit<AuditLogEntry, "at" | "by">) => setAuditLog((l) => [{ ...e, at: nowStamp(), by: user?.name ?? "Sistem" }, ...l]),
    [user]
  );

  const can = useCallback(
    (perm: string) => (permissions[session.role] ?? []).includes(perm),
    [session, permissions]
  );

  const scopeSalesIds = useMemo(() => {
    if (!user || !user.role) return [];
    const scope = roleMeta(user.role).scope;
    if (scope === "all") return M.SALESMEN.map((s) => s.id);
    if (scope === "branch") return M.SALESMEN.filter((s) => s.branchId === user.branchId).map((s) => s.id);
    return M.SALESMEN.filter((s) => s.spvId === user.spvId).map((s) => s.id);
  }, [user, roleMeta]);
  const scopeSet = useMemo(() => new Set(scopeSalesIds), [scopeSalesIds]);
  const inScope = useCallback((id: string) => scopeSet.has(id), [scopeSet]);

  const scopeLabel = useMemo(() => {
    if (!user) return "";
    const scope = roleMeta(user.role).scope;
    const b = M.BRANCHES.find((x) => x.id === user.branchId);
    if (scope === "all") return "Semua cabang";
    if (scope === "branch") return b?.name ?? "";
    return `${b?.name ?? ""} · Tim ${user.name.split(" ")[0]}`;
  }, [user, roleMeta]);

  const canActOnStep = useCallback(
    (a: ApprovalRequest) => {
      if (a.status !== "pending") return false;
      // D-54: role holds the pending step's permission AND the data scope covers the request
      const step = a.steps.find((s) => s.status === "pending");
      return !!step && stepPerms(step).some(can) && inScope(a.salesId);
    },
    [can, inScope]
  );

  const createApproval = useCallback(
    (type: ApprovalType, base: Parameters<typeof makeApproval>[1]) => {
      const r = makeApproval(type, base, settings, salesOf(base.salesId)?.name ?? "Sales");
      setApprovals((list) => [r, ...list]);
      return r;
    },
    [settings]
  );

  /** Module 05 FR-007: Menang = first approved order of the NOO customer (or linked order). */
  const markOrderApproved = useCallback(
    (order: Order) => {
      const opp = opps.find((o) => o.outletId === order.outletId && o.stage !== "Menang" && o.stage !== "Batal");
      if (!opp) return;
      const stamp = nowStamp();
      setOpps((list) =>
        list.map((o) =>
          o.id === opp.id
            ? { ...o, stage: "Menang", pendingStage: undefined, wonOrderId: order.id, log: [...o.log, { at: stamp, by: "Sistem", text: `Menang otomatis: pesanan pertama ${order.no} disetujui` }] }
            : o
        )
      );
      toast({ tone: "success", title: "Peluang otomatis Menang", desc: `${opp.name} · pesanan pertama ${order.no} disetujui` });
    },
    [opps, toast]
  );

  const submitOrderApprovals = useCallback(
    (orderId: string, override?: Order) => {
      const order = override ?? orders.find((o) => o.id === orderId);
      if (!order) return [];
      const outlet = outlets.find((o) => o.id === order.outletId)!;
      const pendingTypes = approvals.filter((a) => a.orderId === orderId && a.status === "pending").map((a) => a.type);
      const needs = orderNeeds(order, outlet, settings).filter((t) => !pendingTypes.includes(t));
      if (!needs.length) return [];
      const made = needs.map((t) => makeApproval(t, { ...orderApprovalBase(t, order, outlet), createdAt: nowStamp() }, settings, salesOf(order.salesId).name));
      setApprovals((list) => [...made, ...list]);
      setOrders((list) =>
        list.map((o) =>
          o.id === orderId
            ? {
                ...(override ?? o),
                status: "Menunggu Approval",
                log: [...(override ?? o).log, { at: nowStamp(), by: override ? "Sistem" : user?.name ?? "Sistem", text: `${override ? "Perubahan melewati batas → diajukan ulang" : "Diajukan"}: ${needs.map((t) => APPROVAL_META[t].short).join(", ")}` }],
              }
            : o
        )
      );
      return needs;
    },
    [orders, outlets, approvals, settings, user]
  );

  /** Demo: a new order arrives from Mile Field (webhook). Auto mode routes failing checks to approval immediately. */
  const simulateIncomingOrder = useCallback(() => {
    const scoped = outlets.filter((o) => o.active && scopeSet.has(o.salesId));
    const nooOpp = opps.find((op) => op.outletId && op.stage !== "Menang" && op.stage !== "Batal" && scoped.some((o) => o.id === op.outletId && o.status === "lama_belum"));
    const target =
      (nooOpp && scoped.find((o) => o.id === nooOpp.outletId)) ??
      scoped.find((o) => o.status === "lama_beli" && o.overdueDays === 0 && o.creditLimit - o.outstanding > 30_000_000 && !orders.some((x) => x.outletId === o.id)) ??
      scoped[0];
    if (!target) return;
    const s = salesOf(target.salesId);
    const seq = M.nextOrderSeq();
    const order: Order = {
      id: `ORD${seq}`,
      no: M.orderNo(s.branchId),
      mfRef: `MF-ORD-2611-${String(seq).padStart(4, "0")}`,
      outletId: target.id,
      salesId: target.salesId,
      date: nowStamp(),
      items: [
        { productId: "P04", uom: "pack", qty: 40, price: 32000 },
        { productId: "P09", uom: "pack", qty: 50, price: 9500 },
      ],
      discountPct: 0,
      status: "Menunggu Review",
      note: nooOpp ? "Pesanan pertama pelanggan baru" : undefined,
      approvedTypes: [],
      log: [{ at: nowStamp(), by: s.name, text: "Pesanan dibuat di Mile Field saat kunjungan (webhook diterima)" }],
    };
    const needs = settings.approvalTrigger === "auto" ? orderNeeds(order, target, settings) : [];
    if (needs.length) {
      order.status = "Menunggu Approval";
      order.log.push({ at: nowStamp(), by: "Sistem", text: `Cek otomatis gagal → diajukan: ${needs.map((t) => APPROVAL_META[t].short).join(", ")}` });
      const made = needs.map((t) => makeApproval(t, { ...orderApprovalBase(t, order, target), createdAt: nowStamp() }, settings, s.name));
      setApprovals((list) => [...made, ...list]);
    }
    setOrders((l) => [order, ...l]);
    toast({
      tone: "info",
      title: "Pesanan baru dari Mile Field",
      desc: `${order.no} · ${target.name}${needs.length ? ` → otomatis ke approval (${needs.map((t) => APPROVAL_META[t].short).join(", ")})` : " · semua cek OK"}`,
    });
    if (!needs.length && orderNeeds(order, target, settings).length === 0) markOrderApproved(order);
  }, [outlets, opps, orders, scopeSet, settings, toast, markOrderApproved]);

  /** Status change with side effects (B: first Selesai → customer becomes "Lama – sudah beli", module 01 FR-009). */
  const setOrderStatus = useCallback(
    (orderId: string, status: OrderStatus, text: string) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      setOrders((l) => l.map((o) => (o.id === orderId ? { ...o, status, log: [...o.log, { at: nowStamp(), by: user?.name ?? "Sistem", text }] } : o)));
      if (status === "Selesai") {
        const outlet = outlets.find((o) => o.id === order.outletId);
        if (outlet && outlet.status !== "lama_beli") {
          setOutlets((l) => l.map((o) => (o.id === outlet.id ? { ...o, status: "lama_beli", lastOrder: M.TODAY } : o)));
          toast({ tone: "success", title: "Status pelanggan diperbarui otomatis", desc: `${outlet.name} → Pelanggan Lama – sudah beli (pesanan pertama Selesai)` });
        }
      }
    },
    [orders, outlets, user, toast]
  );

  const onFinal = useCallback(
    (a: ApprovalRequest, approved: boolean, reason: string, by: string) => {
      const stamp = nowStamp();
      if (a.orderId) {
        const order = orders.find((o) => o.id === a.orderId);
        const othersPending = approvals.some((x) => x.orderId === a.orderId && x.id !== a.id && x.status === "pending");
        const othersRejected = approvals.some((x) => x.orderId === a.orderId && x.id !== a.id && x.status === "rejected");
        setOrders((list) =>
          list.map((o) => {
            if (o.id !== a.orderId) return o;
            const approvedTypes = approved ? [...o.approvedTypes, a.type] : o.approvedTypes;
            const text = `${APPROVAL_META[a.type].short} ${approved ? "disetujui" : "ditolak"} oleh ${by}${reason ? ` (${reason})` : ""}`;
            // Module 06 FR-013: any rejection (incl. discount) rejects the order; all approved → back to order review
            const status: OrderStatus = !approved || othersRejected ? "Ditolak" : othersPending ? "Menunggu Approval" : "Menunggu Review";
            const extra = !approved ? [{ at: stamp, by: "Sistem", text: `Pesanan ditolak karena ${APPROVAL_META[a.type].label} ditolak` }] : [];
            return { ...o, approvedTypes, status, log: [...o.log, { at: stamp, by, text }, ...extra] };
          })
        );
        if (approved && !othersPending && !othersRejected && order) markOrderApproved(order);
      }
      if (a.oppId && a.type === "pipeline_stage") {
        setOpps((list) =>
          list.map((o) => {
            if (o.id !== a.oppId) return o;
            return approved
              ? { ...o, stage: a.toStage ?? o.stage, pendingStage: undefined, log: [...o.log, { at: stamp, by, text: `Perpindahan ke ${a.toStage} disetujui` }] }
              : { ...o, pendingStage: undefined, batalReason: a.toStage === "Batal" ? undefined : o.batalReason, log: [...o.log, { at: stamp, by, text: `Perpindahan ke ${a.toStage} ditolak: ${reason}` }] };
          })
        );
      }
      if (a.type === "noo") {
        if (a.oppId)
          setOpps((list) =>
            list.map((o) =>
              o.id === a.oppId
                ? { ...o, log: [...o.log, { at: stamp, by, text: approved ? "NOO disetujui: pelanggan aktif, siap menerima pesanan pertama" : `NOO ditolak: ${reason}` }] }
                : o
            )
          );
        if (approved) {
          const credit = a.nooCredit ?? { limit: 15_000_000, top: 14, priceGroup: "Retail" };
          const opp = opps.find((o) => o.id === a.oppId);
          const existing = outlets.find((o) => o.id === a.outletId);
          if (existing) {
            setOutlets((list) =>
              list.map((o) =>
                o.id === existing.id
                  ? {
                      ...o,
                      status: "lama_belum",
                      creditLimit: credit.limit,
                      top: credit.top,
                      priceGroup: credit.priceGroup,
                      odooRef: settings.variant === "A" ? `res.partner/${20000 + Number(o.id.slice(1))}` : o.odooRef,
                    }
                  : o
              )
            );
          } else if (opp) {
            const fresh: Outlet[] = [];
            const o = nooOutletFor(opp, fresh);
            setOutlets((list) => [{ ...o, status: "lama_belum", creditLimit: credit.limit, top: credit.top, priceGroup: credit.priceGroup, odooRef: settings.variant === "A" ? `res.partner/${20000 + Number(o.id.slice(1))}` : undefined }, ...list]);
            setOpps((list) => list.map((x) => (x.id === opp.id ? { ...x, outletId: o.id } : x)));
          }
        }
      }
    },
    [settings, opps, orders, outlets, approvals, markOrderApproved]
  );

  const decideApproval = useCallback(
    (id: string, approve: boolean, reason: string, extra?: { nooCredit?: ApprovalRequest["nooCredit"] }) => {
      if (!user) return;
      const a = approvals.find((x) => x.id === id);
      if (!a) return;
      const stamp = nowStamp();
      const idx = a.steps.findIndex((s) => s.status === "pending");
      const steps = a.steps.map((s, i) =>
        i === idx ? { ...s, status: approve ? ("approved" as const) : ("rejected" as const), by: user.name, at: stamp, reason } : s
      );
      let status: ApprovalRequest["status"] = "pending";
      if (!approve) status = "rejected";
      else if (idx + 1 < steps.length) steps[idx + 1] = { ...steps[idx + 1], status: "pending" };
      else status = "approved";
      const entry: AuditEntry = {
        at: stamp,
        by: user.name,
        role: roleMeta(session.role).label,
        action: approve ? (status === "approved" ? "Disetujui (final)" : `Disetujui (tahap ${idx + 1})`) : "Ditolak",
        permission: stepPerms(a.steps[idx]).find(can) ?? a.steps[idx].permission,
        reason:
          reason +
          (extra?.nooCredit ? `${reason ? " · " : ""}Limit ${rupiah(extra.nooCredit.limit)}, TOP ${extra.nooCredit.top} hari, price group ${extra.nooCredit.priceGroup}` : ""),
      };
      const next: ApprovalRequest = { ...a, steps, status, audit: [...a.audit, entry], nooCredit: extra?.nooCredit ?? a.nooCredit };
      if (extra?.nooCredit)
        next.details = [...a.details.filter((d) => d.label !== "Kredit ditetapkan"), { label: "Kredit ditetapkan", value: `${rupiah(extra.nooCredit.limit)} · TOP ${extra.nooCredit.top} hari · ${extra.nooCredit.priceGroup}` }];
      setApprovals((list) => list.map((x) => (x.id === id ? next : x)));
      if (status !== "pending") onFinal(next, status === "approved", reason, user.name);
      if (status === "approved" && a.type === "noo") {
        toast({
          tone: "success",
          title: "Pelanggan baru disetujui",
          desc:
            settings.variant === "A"
              ? `${a.outletName} dibuat di Odoo (res.partner) dan aktif di master outlet sebagai Pelanggan Lama – belum beli.`
              : `${a.outletName} aktif di master outlet modul sebagai Pelanggan Lama – belum beli.`,
        });
      } else {
        toast({
          tone: approve ? "success" : "danger",
          title: approve ? (status === "approved" ? "Request disetujui" : `Langkah ${idx + 1} disetujui, diteruskan ke ${stepTitle(steps, idx + 1)} (pemegang ${steps[idx + 1]?.permission})`) : "Permintaan ditolak",
          desc: `${a.no} · ${a.title}${!approve && a.orderId ? " · pesanan ikut ditolak" : ""}`,
        });
      }
    },
    [session, user, approvals, onFinal, toast, settings.variant, roleMeta, can]
  );

  const moveOpp = useCallback(
    (oppId: string, stage: OppStage, batalReason?: string) => {
      const opp = opps.find((o) => o.id === oppId);
      if (!opp || !user) return;
      const stamp = nowStamp();
      const needsApproval = stage !== opp.stage && (settings.pipelineStageApproval || (stage === "Batal" && settings.pipelineBatalApproval));
      if (needsApproval) {
        setOpps((list) =>
          list.map((o) =>
            o.id === oppId
              ? { ...o, pendingStage: stage, batalReason: batalReason ?? o.batalReason, log: [...o.log, { at: stamp, by: user.name, text: `Minta pindah ke ${stage}${batalReason ? ` (alasan: ${batalReason})` : ""} — menunggu approval (approve_pipeline_stage)` }] }
              : o
          )
        );
        createApproval("pipeline_stage", {
          title: `${opp.name}: ${opp.stage} → ${stage}`,
          salesId: opp.salesId,
          outletName: opp.name,
          amount: opp.value,
          oppId,
          toStage: stage,
          details: [{ label: "Jenis peluang", value: opp.type }, ...(batalReason ? [{ label: "Alasan batal", value: batalReason }] : [])],
        });
        toast({ tone: "info", title: "Menunggu approval tahap", desc: `Perpindahan ke "${stage}" dikirim ke Request › Pipeline (pemegang approve_pipeline_stage).` });
        return;
      }
      setOpps((list) =>
        list.map((o) =>
          o.id === oppId
            ? {
                ...o,
                stage,
                batalReason: stage === "Batal" ? batalReason : undefined,
                log: [...o.log, { at: stamp, by: user.name, text: `Pindah ke ${stage}${batalReason ? ` (alasan: ${batalReason})` : ""}` }],
              }
            : o
        )
      );
      toast({ tone: "success", title: `Dipindah ke ${stage}`, desc: opp.name });
    },
    [opps, user, settings.pipelineStageApproval, settings.pipelineBatalApproval, createApproval, toast]
  );

  /** Module 05 FR-005 / 16: an NOO opportunity is registered at Prospek → prospect outlet + NOO request (approve_noo → approve_noo_credit). */
  const createOpp = useCallback(
    (opp: Opportunity) => {
      if (opp.type !== "Pelanggan Baru (NOO)") {
        setOpps((l) => [opp, ...l]);
        toast({ tone: "success", title: "Peluang dibuat", desc: `${opp.name}${opp.nextKind === "Kunjungan" ? " · masuk call plan sebagai extra call" : ""}` });
        return;
      }
      const fresh: Outlet[] = [];
      const outlet = nooOutletFor(opp, fresh);
      setOutlets((l) => [outlet, ...l]);
      setOpps((l) => [{ ...opp, outletId: outlet.id, log: [...opp.log, { at: nowStamp(), by: "Sistem", text: "NOO dibuat di tahap Prospek → request: verifikasi data (approve_noo) lalu kredit pelanggan (approve_noo_credit)" }] }, ...l]);
      createApproval("noo", {
        title: `Pelanggan baru: ${opp.name}`,
        salesId: opp.salesId,
        outletName: opp.name,
        amount: opp.value,
        oppId: opp.id,
        outletId: outlet.id,
        details: nooDetails(opp),
      });
      toast({ tone: "success", title: "Peluang + NOO dibuat", desc: `${opp.name} · outlet prospek ${outlet.code} (Pelanggan Baru) · Request NOO: approve_noo → approve_noo_credit` });
    },
    [createApproval, toast]
  );

  const reassignOutlets = (inp: ReassignInput) => {
    const ids = new Set(inp.outletIds);
    const target = salesOf(inp.toSalesId);
    const route = inp.toRouteId ? routes.find((r) => r.id === inp.toRouteId) : undefined;
    const moving = outlets.filter((o) => ids.has(o.id) && (o.salesId !== inp.toSalesId || (!!inp.toRouteId && o.routeId !== inp.toRouteId)));
    const movingIds = new Set(moving.map((o) => o.id));
    const by = user?.name ?? "Sistem";
    const at = nowStamp();
    // 1) owner + route (+ branch when moved across branches)
    setOutlets((list) => list.map((o) => (movingIds.has(o.id) ? { ...o, salesId: inp.toSalesId, branchId: target.branchId, routeId: inp.toRouteId ?? (o.salesId === inp.toSalesId ? o.routeId : undefined) } : o)));
    // 2) PJP: remove from the old owner, add to the target as Draft entries
    setPjp((list) => {
      const old = list.filter((e) => movingIds.has(e.outletId));
      const keep = list.filter((e) => !movingIds.has(e.outletId));
      const maxSeq = (day: number) => Math.max(0, ...keep.filter((e) => e.salesId === inp.toSalesId && e.day === day).map((e) => e.seq));
      const added = moving.map((o, i) => {
        const prev = old.find((e) => e.outletId === o.id);
        const freq = prev?.freq ?? settings.defaultFreq;
        const day = route?.day ?? prev?.day ?? 0;
        return { id: `PJ-R${Date.now()}-${i}`, salesId: inp.toSalesId, outletId: o.id, routeId: inp.toRouteId, day, freq, weeks: prev?.weeks ?? weeksFor(freq, i), seq: maxSeq(day) + 1 + i, validFrom: inp.effective };
      });
      return [...keep, ...added];
    });
    setPjpHeaders((hs) => hs.map((h) => (h.salesId === inp.toSalesId && moving.length ? { ...h, status: "Draft", version: h.version + (h.status === "Draft" ? 0 : 1), note: `Ada ${moving.length} outlet hasil plotting (${at}); perlu approval & publikasi ulang.` } : h)));
    // 3) open pipeline follows the outlet
    const oppsMoved = opps.filter((op) => op.outletId && movingIds.has(op.outletId) && op.stage !== "Menang" && op.stage !== "Batal" && op.salesId !== inp.toSalesId).length;
    setOpps((list) => list.map((op) => {
      if (op.outletId && movingIds.has(op.outletId) && op.stage !== "Menang" && op.stage !== "Batal" && op.salesId !== inp.toSalesId) { return { ...op, salesId: inp.toSalesId, log: [...op.log, { at, by, text: `Pindah ke ${target.name} (plotting pelanggan)` }] }; }
      return op;
    }));
    // 4) history + audit
    setOwnershipLog((l) => [
      ...moving.map((o, i) => ({ id: `OWN-${Date.now()}-${i}`, outletId: o.id, fromSalesId: o.salesId, toSalesId: inp.toSalesId, fromRouteId: o.routeId, toRouteId: inp.toRouteId, effective: inp.effective, reason: inp.reason, by, at })),
      ...l,
    ]);
    if (moving.length) addAudit({ module: "Plotting Pelanggan", action: "Pindah outlet", target: `${moving.length} outlet → ${target.name}`, detail: `${route ? `Rute ${route.name} · ` : ""}efektif ${inp.effective} · ${inp.reason}` });
    return { moved: moving.length, pjpMoved: moving.length, oppsMoved };
  };

  const assortmentFor = (o: Outlet) => {
    const base = assortments.find((a) => a.segment === o.segment);
    const ex = assortmentExceptions.filter((e) => e.outletId === o.id);
    const excluded = new Set(ex.filter((e) => e.kind === "exclude").map((e) => e.productId));
    const fallback = !base;
    const baseItems: { productId: string; mustSell: boolean; source: "assortment" | "include" | "fallback" }[] = base
      ? base.items.map((i) => ({ ...i, source: "assortment" as const }))
      : settings.assortmentFallback === "all" ? products.filter((p) => p.active !== false).map((p) => ({ productId: p.id, mustSell: false, source: "fallback" as const })) : [];
    const items = [
      ...baseItems.filter((i) => !excluded.has(i.productId)),
      ...ex.filter((e) => e.kind === "include" && !baseItems.some((i) => i.productId === e.productId)).map((e) => ({ productId: e.productId, mustSell: !!e.mustSell, source: "include" as const })),
    ];
    return { items, fallback };
  };

  const value: AppState & Actions = {
    session,
    user,
    permissions,
    roles,
    settings,
    outlets,
    pjp,
    pjpHeaders,
    pjpShifts,
    opps,
    orders,
    approvals,
    targets,
    users,
    syncDomains,
    syncErrors,
    importLogs,
    toasts,
    products,
    priceLists,
    branches,
    regions,
    routes,
    pjpRequests,
    targetLog,
    auditLog,
    assortments,
    assortmentExceptions,
    ownershipLog,
    setAssortments,
    setAssortmentExceptions,
    reassignOutlets,
    assortmentFor,
    switchUser: (userId) => {
      const u = users.find((x) => x.id === userId);
      if (u && u.role) setSession({ userId, role: u.role });
    },
    can,
    inScope,
    scopeSalesIds,
    scopeLabel,
    toast,
    dismissToast,
    setPermissions,
    setRoles,
    roleMeta,
    setSettings,
    setOutlets,
    setPjp,
    setPjpHeaders,
    setPjpShifts,
    setOpps,
    setOrders,
    setTargets,
    setUsers,
    setSyncDomains,
    setSyncErrors,
    setImportLogs,
    setProducts,
    setPriceLists,
    setBranches,
    setRegions,
    setRoutes,
    setPjpRequests,
    setTargetLog,
    addAudit,
    createApproval,
    decideApproval,
    canActOnStep,
    moveOpp,
    submitOrderApprovals,
    simulateIncomingOrder,
    setOrderStatus,
    createOpp,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export { salesOf };
export const branchOf = (id: string) => M.BRANCHES.find((b) => b.id === id)!;
export const spvOf = (id: string) => M.SPVS.find((s) => s.id === id);
