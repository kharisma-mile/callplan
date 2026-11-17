import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import * as M from "@/data/mock";
import type {
  ApprovalRequest,
  ApprovalType,
  AuditEntry,
  ImportLog,
  ModuleUser,
  Opportunity,
  OppStage,
  Order,
  Outlet,
  PjpEntry,
  RoleKey,
  Settings,
  SyncDomain,
  SyncError,
  TargetRow,
  Toast,
} from "@/data/types";
import { APPROVAL_META, ROLE_META, defaultPermissions } from "@/lib/rbac";
import { buildSteps, orderTotal } from "@/lib/approval";
import { nowStamp, rupiah } from "@/lib/format";

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
    steps: buildSteps(type, { discountPct: base.discountPct, loa: settings.loa }),
    audit: [{ at: createdAt, by, role: "Sales", action: "Permintaan dibuat" }],
  };
}

/* ---------------- initial approvals ---------------- */
function seedApprovals(orders: Order[], opps: Opportunity[], settings: Settings): ApprovalRequest[] {
  const list: ApprovalRequest[] = [];
  const sby1 = M.SALESMEN.filter((s) => s.spvId === "SPV-SBY-1");
  const sby2 = M.SALESMEN.filter((s) => s.spvId === "SPV-SBY-2");
  const jkt = M.SALESMEN.filter((s) => s.branchId === "JKT");
  const outletFor = (salesId: string, i = 0) => M.OUTLETS.filter((o) => o.salesId === salesId)[i];

  // discount linked to order (7% -> BM)
  const dOrder = orders[2];
  const dOutlet = outletOf(M.OUTLETS, dOrder.outletId);
  list.push(
    makeApproval(
      "discount",
      {
        title: `Diskon ${dOrder.discountPct}% untuk ${dOrder.no}`,
        salesId: dOrder.salesId,
        outletName: dOutlet.name,
        amount: orderTotal(dOrder),
        discountPct: dOrder.discountPct,
        orderId: dOrder.id,
        createdAt: "2026-11-17 08:41",
        details: [
          { label: "Pesanan", value: dOrder.no },
          { label: "Alasan", value: dOrder.note ?? "-" },
        ],
      },
      settings,
      salesOf(dOrder.salesId).name
    )
  );
  dOrder.status = "Menunggu Approval";

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
  disc(sby2[0].id, 8, "Program akhir tahun outlet kelas A", "2026-11-16 13:10", 0);
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
      r.audit.push({ at: "2026-11-16 11:00", by: firstApproved, role: "Branch Manager", action: "Disetujui (tahap 1)", permission: "approve_special_order", reason: "Margin masih aman" });
    }
    list.push(r);
  };
  so(sby1[1].id, "Cetak logo custom thinwall 500 ml (proyek katering)", 86_000_000, "2026-11-17 07:55");
  so(M.SALESMEN.find((s) => s.branchId === "BDG")!.id, "Kantong HD ukuran khusus 60x90 untuk pabrik", 142_000_000, "2026-11-15 14:00", "Bambang Prasetyo");

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

  // NOO
  const noo = (opp: Opportunity, at: string, spvDone?: string) => {
    const r = makeApproval(
      "noo",
      {
        title: `Pelanggan baru: ${opp.name}`,
        salesId: opp.salesId,
        outletName: opp.name,
        amount: opp.value,
        oppId: opp.id,
        createdAt: at,
        details: [
          { label: "Pemilik", value: opp.contact },
          { label: "Alamat + GPS", value: `${opp.city} · -7.2575, 112.7521` },
          { label: "Dokumen", value: "Foto toko, KTP (NPWP: non-PKP)" },
          { label: "Limit diminta", value: rupiah(15_000_000) + " · TOP 14 hari" },
        ],
      },
      settings,
      salesOf(opp.salesId).name
    );
    if (spvDone) {
      r.steps[0] = { ...r.steps[0], status: "approved", by: spvDone, at: "2026-11-16 10:10", reason: "Data lengkap" };
      r.steps[1] = { ...r.steps[1], status: "pending" };
      r.audit.push({ at: "2026-11-16 10:10", by: spvDone, role: "Sales SPV", action: "Disetujui (tahap 1)", permission: "approve_noo", reason: "Data lengkap" });
    }
    list.push(r);
  };
  const won = opps.filter((o) => o.stage === "Menang" && o.type === "Pelanggan Baru (NOO)");
  const sbyWon = won.filter((o) => salesOf(o.salesId).spvId === "SPV-SBY-1");
  if (sbyWon[0]) noo(sbyWon[0], "2026-11-17 08:20");
  if (sbyWon[1]) noo(sbyWon[1], "2026-11-16 09:00", "Dewi Lestari");
  const otherWon = won.find((o) => salesOf(o.salesId).branchId !== "SBY");
  if (otherWon) noo(otherWon, "2026-11-16 14:30");

  return list;
}

function monthsTargets(rows: TargetRow[]): TargetRow[] {
  return [
    ...rows.map((r) => ({ ...r, month: "2026-10", actual: Math.round(r.target * 0.93) })),
    ...rows,
    ...rows.map((r) => ({ ...r, month: "2026-12", target: Math.round((r.target * 1.1) / 1_000_000) * 1_000_000, actual: 0 })),
  ];
}

/* ---------------- context ---------------- */
interface Session {
  userId: string;
  role: RoleKey;
}

export interface AppState {
  session: Session | null;
  user: ModuleUser | null;
  permissions: Record<RoleKey, string[]>;
  settings: Settings;
  outlets: Outlet[];
  pjp: PjpEntry[];
  opps: Opportunity[];
  orders: Order[];
  approvals: ApprovalRequest[];
  targets: { sales: TargetRow[]; branch: TargetRow[]; product: TargetRow[] };
  users: ModuleUser[];
  syncDomains: SyncDomain[];
  syncErrors: SyncError[];
  importLogs: ImportLog[];
  toasts: Toast[];
}

interface Actions {
  login: (userId: string) => void;
  logout: () => void;
  can: (perm: string) => boolean;
  inScope: (salesId: string) => boolean;
  scopeSalesIds: string[];
  scopeLabel: string;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  setPermissions: (fn: (p: Record<RoleKey, string[]>) => Record<RoleKey, string[]>) => void;
  setSettings: (fn: (s: Settings) => Settings) => void;
  setOutlets: (fn: (o: Outlet[]) => Outlet[]) => void;
  setPjp: (fn: (p: PjpEntry[]) => PjpEntry[]) => void;
  setOpps: (fn: (o: Opportunity[]) => Opportunity[]) => void;
  setOrders: (fn: (o: Order[]) => Order[]) => void;
  setTargets: (fn: (t: AppState["targets"]) => AppState["targets"]) => void;
  setUsers: (fn: (u: ModuleUser[]) => ModuleUser[]) => void;
  setSyncDomains: (fn: (d: SyncDomain[]) => SyncDomain[]) => void;
  setSyncErrors: (fn: (d: SyncError[]) => SyncError[]) => void;
  setImportLogs: (fn: (d: ImportLog[]) => ImportLog[]) => void;
  createApproval: (type: ApprovalType, base: Parameters<typeof makeApproval>[1]) => ApprovalRequest;
  decideApproval: (id: string, approve: boolean, reason: string) => void;
  canActOnStep: (a: ApprovalRequest) => boolean;
  moveOpp: (oppId: string, stage: OppStage, batalReason?: string) => void;
}

const Ctx = createContext<(AppState & Actions) | null>(null);

export function AppProvider({ children, initialUserId }: { children: ReactNode; initialUserId?: string }) {
  const init = useRef<{ orders: Order[]; opps: Opportunity[]; approvals: ApprovalRequest[] } | null>(null);
  if (!init.current) {
    const orders = M.ORDERS.map((o) => ({ ...o }));
    const opps = M.OPPORTUNITIES.map((o) => ({ ...o }));
    const approvals = seedApprovals(orders, opps, M.DEFAULT_SETTINGS);
    init.current = { orders, opps, approvals };
  }
  const [session, setSession] = useState<Session | null>(() => {
    const u = initialUserId ? M.USERS.find((x) => x.id === initialUserId) : undefined;
    return u ? { userId: u.id, role: u.role } : null;
  });
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [settings, setSettings] = useState<Settings>(M.DEFAULT_SETTINGS);
  const [outlets, setOutlets] = useState<Outlet[]>(M.OUTLETS);
  const [pjp, setPjp] = useState<PjpEntry[]>(M.PJP);
  const [opps, setOpps] = useState<Opportunity[]>(init.current.opps);
  const [orders, setOrders] = useState<Order[]>(init.current.orders);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(init.current.approvals);
  const [targets, setTargets] = useState({
    sales: monthsTargets(M.TARGETS_SALES),
    branch: monthsTargets(M.TARGETS_BRANCH),
    product: monthsTargets(M.TARGETS_PRODUCT),
  });
  const [users, setUsers] = useState<ModuleUser[]>(M.USERS);
  const [syncDomains, setSyncDomains] = useState(M.SYNC_DOMAINS);
  const [syncErrors, setSyncErrors] = useState(M.SYNC_ERRORS);
  const [importLogs, setImportLogs] = useState(M.IMPORT_LOGS);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const user = session ? users.find((u) => u.id === session.userId) ?? null : null;

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const can = useCallback(
    (perm: string) => (session ? permissions[session.role].includes(perm) : false),
    [session, permissions]
  );

  const scopeSalesIds = useMemo(() => {
    if (!user) return [];
    const scope = ROLE_META[user.role].scope;
    if (scope === "all") return M.SALESMEN.map((s) => s.id);
    if (scope === "branch") return M.SALESMEN.filter((s) => s.branchId === user.branchId).map((s) => s.id);
    return M.SALESMEN.filter((s) => s.spvId === user.spvId).map((s) => s.id);
  }, [user]);
  const scopeSet = useMemo(() => new Set(scopeSalesIds), [scopeSalesIds]);
  const inScope = useCallback((id: string) => scopeSet.has(id), [scopeSet]);

  const scopeLabel = useMemo(() => {
    if (!user) return "";
    const scope = ROLE_META[user.role].scope;
    const b = M.BRANCHES.find((x) => x.id === user.branchId);
    if (scope === "all") return "Semua cabang";
    if (scope === "branch") return b?.name ?? "";
    return `${b?.name ?? ""} · Tim ${user.name.split(" ")[0]}`;
  }, [user]);

  const canActOnStep = useCallback(
    (a: ApprovalRequest) => {
      if (!session || a.status !== "pending") return false;
      if (!can(APPROVAL_META[a.type].perm)) return false;
      const step = a.steps.find((s) => s.status === "pending");
      return !!step && step.roles.includes(session.role);
    },
    [session, can]
  );

  const createApproval = useCallback(
    (type: ApprovalType, base: Parameters<typeof makeApproval>[1]) => {
      const r = makeApproval(type, base, settings, salesOf(base.salesId)?.name ?? "Sales");
      setApprovals((list) => [r, ...list]);
      return r;
    },
    [settings]
  );

  const onFinal = useCallback(
    (a: ApprovalRequest, approved: boolean, reason: string, by: string) => {
      const stamp = nowStamp();
      if (a.orderId) {
        setOrders((list) =>
          list.map((o) => {
            if (o.id !== a.orderId) return o;
            const approvedTypes = approved ? [...o.approvedTypes, a.type] : o.approvedTypes;
            let status = o.status;
            let discountPct = o.discountPct;
            let text = `${APPROVAL_META[a.type].short} ${approved ? "disetujui" : "ditolak"} oleh ${by}`;
            if (!approved && a.type === "discount") {
              discountPct = settings.loa[0]?.max ?? 0;
              text += ` — diskon dikembalikan ke ${discountPct}%`;
            }
            if (!approved && a.type !== "discount") status = "Ditolak";
            else status = "Menunggu Review";
            return { ...o, approvedTypes, status, discountPct, log: [...o.log, { at: stamp, by, text: text + (reason ? ` (${reason})` : "") }] };
          })
        );
      }
      if (a.oppId) {
        setOpps((list) =>
          list.map((o) => {
            if (o.id !== a.oppId) return o;
            if (a.type === "pipeline_stage") {
              return approved
                ? { ...o, stage: a.toStage ?? o.stage, pendingStage: undefined, log: [...o.log, { at: stamp, by, text: `Perpindahan ke ${a.toStage} disetujui` }] }
                : { ...o, pendingStage: undefined, log: [...o.log, { at: stamp, by, text: `Perpindahan ke ${a.toStage} ditolak: ${reason}` }] };
            }
            return { ...o, log: [...o.log, { at: stamp, by, text: `Approval NOO ${approved ? "disetujui" : "ditolak"}` }] };
          })
        );
        if (a.type === "pipeline_stage" && approved && a.toStage === "Menang") {
          const opp = opps.find((o) => o.id === a.oppId);
          if (opp && opp.type === "Pelanggan Baru (NOO)")
            createApproval("noo", {
              title: `Pelanggan baru: ${opp.name}`,
              salesId: opp.salesId,
              outletName: opp.name,
              amount: opp.value,
              oppId: opp.id,
              details: [
                { label: "Pemilik", value: opp.contact },
                { label: "Alamat + GPS", value: `${opp.city} · dari check-in Mile Field` },
                { label: "Dokumen", value: "Foto toko, KTP" },
              ],
            });
        }
        if (a.type === "noo" && approved) {
          const opp = opps.find((o) => o.id === a.oppId);
          if (opp) {
            const seq = M.nextOutletSeq();
            const s = salesOf(opp.salesId);
            setOutlets((list) => [
              {
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
                cls: "C",
                segment: "Horeka",
                creditLimit: 15_000_000,
                outstanding: 0,
                overdue: 0,
                overdueDays: 0,
                top: 14,
                odooRef: settings.variant === "A" ? `res.partner/${20000 + seq}` : undefined,
              },
              ...list,
            ]);
          }
        }
      }
    },
    [settings, opps, createApproval]
  );

  const decideApproval = useCallback(
    (id: string, approve: boolean, reason: string) => {
      if (!session || !user) return;
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
        role: ROLE_META[session.role].label,
        action: approve ? (status === "approved" ? "Disetujui (final)" : `Disetujui (tahap ${idx + 1})`) : "Ditolak",
        permission: APPROVAL_META[a.type].perm,
        reason,
      };
      const next = { ...a, steps, status, audit: [...a.audit, entry] };
      setApprovals((list) => list.map((x) => (x.id === id ? next : x)));
      if (status !== "pending") onFinal(next, status === "approved", reason, user.name);
      if (status === "approved" && a.type === "noo") {
        toast({
          tone: "success",
          title: "Pelanggan baru disetujui",
          desc:
            settings.variant === "A"
              ? `${a.outletName} dibuat di Odoo (res.partner) dan masuk master outlet sebagai Pelanggan Baru.`
              : `${a.outletName} masuk master outlet modul sebagai Pelanggan Baru.`,
        });
      } else {
        toast({
          tone: approve ? "success" : "danger",
          title: approve ? (status === "approved" ? "Approval disetujui" : `Tahap ${idx + 1} disetujui, diteruskan ke ${steps[idx + 1]?.label}`) : "Permintaan ditolak",
          desc: `${a.no} · ${a.title}`,
        });
      }
    },
    [session, user, approvals, onFinal, toast, settings.variant]
  );

  const moveOpp = useCallback(
    (oppId: string, stage: OppStage, batalReason?: string) => {
      const opp = opps.find((o) => o.id === oppId);
      if (!opp || !user) return;
      const stamp = nowStamp();
      if (settings.pipelineStageApproval && stage !== opp.stage) {
        setOpps((list) =>
          list.map((o) =>
            o.id === oppId
              ? { ...o, pendingStage: stage, batalReason: batalReason ?? o.batalReason, log: [...o.log, { at: stamp, by: user.name, text: `Minta pindah ke ${stage} (menunggu approval SPV)` }] }
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
        toast({ tone: "info", title: "Menunggu approval tahap", desc: `Perpindahan ke "${stage}" dikirim ke halaman Approval Tahap Pipeline.` });
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
      if (stage === "Menang" && opp.type === "Pelanggan Baru (NOO)") {
        createApproval("noo", {
          title: `Pelanggan baru: ${opp.name}`,
          salesId: opp.salesId,
          outletName: opp.name,
          amount: opp.value,
          oppId,
          details: [
            { label: "Pemilik", value: opp.contact },
            { label: "Alamat + GPS", value: `${opp.city} · dari check-in Mile Field` },
            { label: "Dokumen", value: "Foto toko, KTP" },
          ],
        });
        toast({ tone: "success", title: "Peluang menang", desc: "Approval Pelanggan Baru (NOO) dibuat: SPV → Finance." });
      } else {
        toast({ tone: "success", title: `Dipindah ke ${stage}`, desc: opp.name });
      }
    },
    [opps, user, settings.pipelineStageApproval, createApproval, toast]
  );

  const value: AppState & Actions = {
    session,
    user,
    permissions,
    settings,
    outlets,
    pjp,
    opps,
    orders,
    approvals,
    targets,
    users,
    syncDomains,
    syncErrors,
    importLogs,
    toasts,
    login: (userId) => {
      const u = users.find((x) => x.id === userId);
      if (u) setSession({ userId, role: u.role });
    },
    logout: () => setSession(null),
    can,
    inScope,
    scopeSalesIds,
    scopeLabel,
    toast,
    dismissToast,
    setPermissions,
    setSettings,
    setOutlets,
    setPjp,
    setOpps,
    setOrders,
    setTargets,
    setUsers,
    setSyncDomains,
    setSyncErrors,
    setImportLogs,
    createApproval,
    decideApproval,
    canActOnStep,
    moveOpp,
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
