import type {
  ApprovalRequest,
  Branch,
  CustomerStatus,
  ImportLog,
  ModuleUser,
  Opportunity,
  OppStage,
  OppType,
  Order,
  Outlet,
  OutletClass,
  PjpEntry,
  PjpChangeRequest,
  PriceList,
  Product,
  Region,
  Route,
  Salesman,
  Settings,
  Spv,
  SyncDomain,
  SyncError,
  TargetRow,
  FollowKind,
} from "./types";

/* ---------- deterministic RNG so the demo is identical every load ---------- */
let seed = 20261117;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
const between = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));

export const TODAY = "2026-11-17";
export const CURRENT_MONTH = "2026-11";
/** Start (Monday) of the current 4-week PJP rotation. */
export const CYCLE_START = "2026-11-02";
export const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Map an ISO date to {week 1..4, day 0..5} of the current rotation, or null. */
export function cyclePos(iso: string): { week: number; day: number } | null {
  const start = new Date(CYCLE_START + "T00:00:00").getTime();
  const t = new Date(iso + "T00:00:00").getTime();
  const diff = Math.round((t - start) / 86400000);
  if (diff < 0 || diff >= 28) return null;
  const day = diff % 7;
  if (day > 5) return null;
  return { week: Math.floor(diff / 7) + 1, day };
}
export function cycleDate(week: number, day: number) {
  return addDays(CYCLE_START, (week - 1) * 7 + day);
}

/* ---------- org ---------- */
export const BRANCHES: Branch[] = [
  { id: "JKT", name: "Cabang Jakarta", city: "Jakarta Barat" },
  { id: "TGR", name: "Cabang Tangerang", city: "Tangerang" },
  { id: "BDG", name: "Cabang Bandung", city: "Bandung" },
  { id: "SMG", name: "Cabang Semarang", city: "Semarang" },
  { id: "SBY", name: "Cabang Surabaya", city: "Surabaya" },
  { id: "MDN", name: "Cabang Medan", city: "Medan" },
  { id: "PLG", name: "Cabang Palembang", city: "Palembang" },
  { id: "MKS", name: "Cabang Makassar", city: "Makassar" },
  { id: "DPS", name: "Cabang Denpasar", city: "Denpasar" },
  { id: "HQ", name: "HQ Direct Sales", city: "Jakarta" },
];

const FIRST = ["Andi", "Bayu", "Citra", "Dimas", "Eko", "Fajar", "Gilang", "Hadi", "Indra", "Joko", "Kurniawan", "Lukman", "Maya", "Nanda", "Oki", "Putri", "Rizky", "Slamet", "Taufik", "Umar", "Vina", "Wahyu", "Yoga", "Zainal", "Arif", "Bambang", "Dodi", "Ferry", "Galih", "Hendro", "Irfan", "Rudi", "Teguh", "Yusuf", "Wawan", "Agung"];
const LAST = ["Saputra", "Pratama", "Wibowo", "Hidayat", "Nugroho", "Santoso", "Setiawan", "Kurnia", "Siregar", "Gunawan", "Halim", "Purnomo", "Sitompul", "Rahman", "Firmansyah", "Susanto", "Hartono", "Lubis", "Wijaya", "Prasetyo"];

const SALES_COUNT: Record<string, number> = { JKT: 7, TGR: 6, BDG: 6, SMG: 6, SBY: 7, MDN: 6, PLG: 6, MKS: 6, DPS: 6, HQ: 5 };

export const SPVS: Spv[] = [];
export const SALESMEN: Salesman[] = [];

const usedNames = new Set<string>();
function personName() {
  for (;;) {
    const n = `${pick(FIRST)} ${pick(LAST)}`;
    if (!usedNames.has(n)) {
      usedNames.add(n);
      return n;
    }
  }
}
// fixed demo personas
["Dewi Lestari", "Budi Santoso", "Hendra Wijaya", "Rina Kusuma", "Sari Anggraini", "Agus Setiawan"].forEach((n) => usedNames.add(n));

for (const b of BRANCHES) {
  const spvCount = b.id === "HQ" ? 1 : 2;
  for (let i = 1; i <= spvCount; i++) {
    const id = `SPV-${b.id}-${i}`;
    SPVS.push({ id, name: b.id === "SBY" && i === 1 ? "Dewi Lestari" : personName(), branchId: b.id });
  }
  const n = SALES_COUNT[b.id];
  for (let i = 1; i <= n; i++) {
    SALESMEN.push({
      id: `S-${b.id}-${String(i).padStart(2, "0")}`,
      code: `${b.id}${String(i).padStart(2, "0")}`,
      name: personName(),
      branchId: b.id,
      spvId: `SPV-${b.id}-${b.id === "HQ" ? 1 : i <= Math.ceil(n / 2) ? 1 : 2}`,
    });
  }
}

/* ---------- products ---------- */
export const PRODUCTS: Product[] = [
  { id: "P01", sku: "UP-KHD-2440", name: "Kantong Plastik HD 24x40", category: "Kantong", uoms: [{ uom: "pack", price: 18500, conv: 1 }, { uom: "karton", price: 362000, conv: 20 }] },
  { id: "P02", sku: "UP-KHD-3555", name: "Kantong Plastik HD 35x55", category: "Kantong", uoms: [{ uom: "pack", price: 27500, conv: 1 }, { uom: "karton", price: 540000, conv: 20 }] },
  { id: "P03", sku: "UP-GPP-16", name: "Gelas Plastik PP 16 oz", category: "Food Packaging", uoms: [{ uom: "pack", price: 21000, conv: 1 }, { uom: "karton", price: 1000000, conv: 50 }] },
  { id: "P04", sku: "UP-TW-500", name: "Thinwall 500 ml + Tutup", category: "Food Packaging", uoms: [{ uom: "pack", price: 32000, conv: 1 }, { uom: "karton", price: 780000, conv: 25 }] },
  { id: "P05", sku: "UP-PET-600", name: "Botol PET 600 ml", category: "Botol", uoms: [{ uom: "pcs", price: 850, conv: 1 }, { uom: "karton", price: 196000, conv: 240 }] },
  { id: "P06", sku: "UP-WRP-30", name: "Plastik Wrap 30 cm x 500 m", category: "Film", uoms: [{ uom: "pcs", price: 98000, conv: 1 }, { uom: "karton", price: 1150000, conv: 12 }] },
  { id: "P07", sku: "UP-EMB-15", name: "Ember Plastik 15 L", category: "Rumah Tangga", uoms: [{ uom: "pcs", price: 24500, conv: 1 }, { uom: "karton", price: 285000, conv: 12 }] },
  { id: "P08", sku: "UP-KFG-1000", name: "Kontainer Food Grade 1000 ml", category: "Food Packaging", uoms: [{ uom: "pack", price: 45000, conv: 1 }, { uom: "karton", price: 870000, conv: 20 }] },
  { id: "P09", sku: "UP-SDT-6", name: "Sedotan Steril 6 mm", category: "Food Packaging", uoms: [{ uom: "pack", price: 9500, conv: 1 }, { uom: "karton", price: 460000, conv: 50 }] },
  { id: "P10", sku: "UP-BPP-RG", name: "Biji Plastik PP Regrind", category: "Bahan Baku", uoms: [{ uom: "kg", price: 14200, conv: 1 }] },
  { id: "P11", sku: "UP-KRG-5090", name: "Karung Plastik 50x90", category: "Karung", uoms: [{ uom: "pcs", price: 2300, conv: 1 }, { uom: "bal", price: 225000, conv: 100 }] },
  { id: "P12", sku: "UP-STR-PE", name: "Stretch Film PE 50 cm", category: "Film", uoms: [{ uom: "pcs", price: 112000, conv: 1 }, { uom: "karton", price: 640000, conv: 6 }] },
];
export const productById = (id: string) => PRODUCTS.find((p) => p.id === id)!;

/* ---------- outlets ---------- */
const PREFIX = ["Toko", "UD", "CV", "PT", "Toko Plastik", "Grosir"];
const OUTLET_NAMES = ["Sinar Jaya", "Makmur Abadi", "Sumber Rejeki", "Berkah Plastik", "Mitra Kemasan", "Cahaya Baru", "Maju Bersama", "Sentosa", "Harapan Jaya", "Mulia Pack", "Anugerah", "Karya Utama", "Indah Plastik", "Surya Kencana", "Bintang Timur", "Rejeki Lancar", "Sejahtera", "Murni", "Gemilang", "Nusantara Pack", "Prima Kemas", "Tunas Baru", "Lancar Jaya", "Abadi Sentosa", "Mega Plastik", "Jaya Mandiri", "Setia Kawan", "Bumi Kemasan", "Duta Plastik", "Kencana"];
const SEGMENTS = ["Grosir Plastik", "Toko Kemasan", "Industri F&B", "Horeka", "Agen / Sub-distributor", "Toko Kelontong"];
const STREETS = ["Jl. Raya", "Jl. Pasar", "Jl. Industri", "Jl. Merdeka", "Jl. Pahlawan", "Jl. Diponegoro", "Jl. Ahmad Yani", "Jl. Gatot Subroto"];

export const OUTLETS: Outlet[] = [];
let outletSeq = 1;
for (const s of SALESMEN) {
  const b = BRANCHES.find((x) => x.id === s.branchId)!;
  const count = s.branchId === "SBY" ? 7 : 5;
  for (let i = 0; i < count; i++) {
    const cls: OutletClass = i < 2 ? "A" : i < 4 ? "B" : "C";
    const r = rnd();
    const status: CustomerStatus = r < 0.12 ? "baru" : r < 0.82 ? "lama_beli" : "lama_belum";
    const creditLimit = status === "baru" ? 0 : cls === "A" ? between(15, 40) * 10_000_000 : cls === "B" ? between(5, 15) * 10_000_000 : between(1, 5) * 10_000_000;
    const outstanding = status === "lama_beli" ? Math.round(creditLimit * (0.2 + rnd() * 0.75)) : 0;
    const hasOverdue = outstanding > 0 && rnd() < 0.3;
    const overdueDays = hasOverdue ? between(5, 52) : 0;
    const code = `C-${s.branchId}-${String(outletSeq).padStart(4, "0")}`;
    OUTLETS.push({
      id: `O${outletSeq}`,
      code,
      name: `${pick(PREFIX)} ${pick(OUTLET_NAMES)}${rnd() < 0.3 ? " " + b.city.split(" ")[0] : ""}`,
      owner: `${pick(FIRST)} ${pick(LAST)}`,
      phone: `08${between(11, 59)}-${between(1000, 9999)}-${between(1000, 9999)}`,
      address: `${pick(STREETS)} No. ${between(1, 250)}`,
      city: b.city,
      branchId: s.branchId,
      salesId: s.id,
      status,
      cls,
      segment: pick(SEGMENTS),
      creditLimit,
      outstanding,
      overdue: hasOverdue ? Math.round(outstanding * (0.2 + rnd() * 0.5)) : 0,
      overdueDays,
      top: status === "baru" ? 0 : pick([14, 30, 30, 45]),
      lastOrder: status === "lama_beli" ? addDays(TODAY, -between(2, 40)) : undefined,
      odooRef: status === "baru" ? undefined : `res.partner/${10400 + outletSeq}`,
      active: true,
      gps: status === "baru" && rnd() < 0.3 ? undefined : { lat: Number((-6.2 - rnd() * 2).toFixed(5)), lng: Number((106.8 + rnd() * 6).toFixed(5)) },
      npwp: rnd() < 0.45 ? `0${between(1, 9)}.${between(100, 999)}.${between(100, 999)}.${between(1, 9)}-${between(100, 999)}.000` : undefined,
      pkp: false,
      priceGroup: cls === "A" ? "Grosir" : pick(["Retail", "Retail", "Grosir", "Horeka / Industri"]),
      routeId: `R-${s.branchId}-${(i % 3) + 1}`,
      source: status === "baru" ? "noo" : "odoo",
    });
    const last = OUTLETS[OUTLETS.length - 1];
    last.pkp = !!last.npwp && rnd() < 0.6;
    outletSeq++;
  }
}
export function nextOutletSeq() {
  return outletSeq++;
}

/* ---------- PJP ---------- */
export function weeksFor(freq: "F4" | "F2" | "F1", offset: number) {
  if (freq === "F4") return [1, 2, 3, 4];
  if (freq === "F2") return offset % 2 === 0 ? [1, 3] : [2, 4];
  return [(offset % 4) + 1];
}
export const PJP: PjpEntry[] = [];
let pjpSeq = 1;
for (const s of SALESMEN) {
  const outlets = OUTLETS.filter((o) => o.salesId === s.id && o.status !== "baru");
  outlets.forEach((o, i) => {
    const freq = o.cls === "A" ? "F4" : o.cls === "B" || o.status === "lama_belum" ? "F2" : "F1";
    PJP.push({ id: `PJP${pjpSeq++}`, salesId: s.id, outletId: o.id, day: i % 6, freq, weeks: weeksFor(freq, i), seq: Math.floor(i / 6) + 1, validFrom: CYCLE_START });
  });
}
export function nextPjpId() {
  return `PJP${pjpSeq++}`;
}

/* ---------- pipeline ---------- */
const STAGES_SEED: OppStage[] = ["Prospek", "Prospek", "Dijadwalkan", "Dijadwalkan", "Kunjungan & Negosiasi", "Kunjungan & Negosiasi", "Kunjungan & Negosiasi", "Menang", "Batal"];
const PROSPECT_NAMES = ["Rumah Makan Padang Sederhana", "Kopi Kenangan Mantan Ruko", "Pabrik Roti Sari Wangi", "Katering Bu Ningsih", "Toko Kue Lestari", "Depot Air Isi Ulang Tirta", "Minimarket Barokah", "Pabrik Kerupuk Dua Putri", "Es Teh Nusantara Outlet", "Bakso Pak Kumis", "CV Snack Gurih Mandiri", "Laundry Kilat Bersih", "PT Sambal Ibu Nusa", "Frozen Food Mama Ina", "Warung Kopi Tepi Kali", "Toko Grosir Sembako Amanah", "Ayam Geprek Juara", "PT Mie Ayam Nusantara", "Kedai Jus Segar", "Bengkel Cuci Mobil Prima"];
const BATAL_REASONS = ["Harga", "Kompetitor", "Belum butuh", "Masalah kredit / pembayaran", "Tidak bisa dihubungi", "Lainnya"];
export { BATAL_REASONS };

export const OPPORTUNITIES: Opportunity[] = [];
let oppSeq = 1;
function seedOpp(salesId: string, stage: OppStage, type: OppType) {
  const s = SALESMEN.find((x) => x.id === salesId)!;
  const b = BRANCHES.find((x) => x.id === s.branchId)!;
  const nextOffset = stage === "Prospek" ? between(-6, 3) : between(-4, 10);
  const id = `OPP${oppSeq++}`;
  const name =
    type === "Pelanggan Baru (NOO)"
      ? pick(PROSPECT_NAMES)
      : `${OUTLETS.find((o) => o.salesId === salesId)?.name ?? "Toko"} – ${type.includes("proyek") ? "Proyek kemasan" : "Produk food grade"}`;
  OPPORTUNITIES.push({
    id,
    name,
    contact: `${pick(FIRST)} ${pick(LAST)}`,
    city: b.city,
    type,
    salesId,
    stage,
    value: between(3, 60) * 2_500_000,
    nextDate: addDays(TODAY, nextOffset),
    nextKind: pick<FollowKind>(["Kunjungan", "Kunjungan", "Telepon", "Kirim penawaran"]),
    batalReason: stage === "Batal" ? pick(BATAL_REASONS.slice(0, 5)) : undefined,
    createdAt: addDays(TODAY, -between(3, 40)),
    log: [{ at: addDays(TODAY, -between(3, 40)) + " 09:12", by: s.name, text: "Prospek dibuat dari Mile Field (NOO)" }],
  });
}
const sbyTeam1 = SALESMEN.filter((s) => s.spvId === "SPV-SBY-1");
const NOO: OppType = "Pelanggan Baru (NOO)";
const SBY_PLAN: [OppStage, OppType][][] = [
  [["Prospek", NOO], ["Dijadwalkan", NOO], ["Kunjungan & Negosiasi", NOO], ["Menang", NOO], ["Kunjungan & Negosiasi", "Pelanggan Lama – proyek"]],
  [["Prospek", NOO], ["Kunjungan & Negosiasi", NOO], ["Menang", NOO], ["Batal", NOO], ["Dijadwalkan", "Pelanggan Lama – produk baru"]],
  [["Prospek", NOO], ["Dijadwalkan", NOO], ["Kunjungan & Negosiasi", NOO], ["Menang", NOO]],
  [["Prospek", NOO], ["Dijadwalkan", NOO], ["Batal", NOO], ["Kunjungan & Negosiasi", "Pelanggan Lama – produk baru"]],
];
sbyTeam1.forEach((s, i) => SBY_PLAN[i % SBY_PLAN.length].forEach(([st, ty]) => seedOpp(s.id, st, ty)));
SALESMEN.filter((s) => s.spvId !== "SPV-SBY-1").forEach((s, i) => {
  if (i % 2 === 0) seedOpp(s.id, pick(STAGES_SEED), "Pelanggan Baru (NOO)");
  if (i % 3 === 0) seedOpp(s.id, pick(STAGES_SEED), rnd() < 0.7 ? "Pelanggan Baru (NOO)" : "Pelanggan Lama – proyek");
});
export function nextOppId() {
  return `OPP${oppSeq++}`;
}

/* ---------- orders ---------- */
export const ORDERS: Order[] = [];
let orderSeq = 241;
const orderNoSeq: Record<string, number> = {};
/** Module 07 FR-001: order number per branch `SO-<branch>-<yyyymm>-<seq>`. */
export function orderNo(branchId: string) {
  orderNoSeq[branchId] = (orderNoSeq[branchId] ?? (branchId === "SBY" ? 240 : 120)) + 1;
  return `SO-${branchId}-202611-${String(orderNoSeq[branchId]).padStart(4, "0")}`;
}
function seedOrder(outlet: Outlet, items: [string, string, number, number?][], discountPct = 0, note?: string) {
  const s = SALESMEN.find((x) => x.id === outlet.salesId)!;
  ORDERS.push({
    id: `ORD${orderSeq}`,
    no: orderNo(s.branchId),
    mfRef: `MF-ORD-2611-${String(orderSeq).padStart(4, "0")}`,
    outletId: outlet.id,
    salesId: outlet.salesId,
    date: `${addDays(TODAY, -between(0, 1))} ${String(between(8, 16)).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}`,
    items: items.map(([pid, uom, qty, price]) => {
      const pr = productById(pid).uoms.find((u) => u.uom === uom);
      return { productId: pid, uom, qty, price: price ?? pr?.price ?? 0 };
    }),
    discountPct,
    status: "Menunggu Review",
    note,
    approvedTypes: [],
    log: [{ at: TODAY + " 08:00", by: s.name, text: "Pesanan dibuat di Mile Field saat kunjungan" }],
  });
  orderSeq++;
}
const sbyOutlets = OUTLETS.filter((o) => o.branchId === "SBY" && o.status === "lama_beli");
// guarantee one outlet that will exceed credit limit
const tight = sbyOutlets[1];
tight.creditLimit = 50_000_000;
tight.outstanding = 46_500_000;
tight.overdue = 0;
tight.overdueDays = 0;
const overdueOutlet = sbyOutlets[4];
overdueOutlet.overdue = 12_400_000;
overdueOutlet.overdueDays = 38;
overdueOutlet.outstanding = Math.max(overdueOutlet.outstanding, 20_000_000);
const cleanOutlets = sbyOutlets.filter((o) => o !== tight && o !== overdueOutlet).map((o) => {
  o.overdue = 0;
  o.overdueDays = 0;
  o.outstanding = Math.round(o.creditLimit * 0.3);
  return o;
});
seedOrder(cleanOutlets[0], [["P01", "karton", 10], ["P03", "karton", 4], ["P09", "pack", 30]]);
seedOrder(tight, [["P04", "karton", 6], ["P08", "karton", 3]], 0, "Minta kirim Kamis pagi");
seedOrder(cleanOutlets[1], [["P05", "karton", 15], ["P06", "pcs", 8]], 7, "Diskon 7% untuk pembelian rutin");
seedOrder(cleanOutlets[2], [["P02", "pack", 40, 25000], ["P07", "pcs", 24]], 0, "Harga mengikuti penawaran sales");
seedOrder(overdueOutlet, [["P11", "bal", 12], ["P12", "karton", 2]]);
seedOrder(cleanOutlets[3], [["P10", "kg", 500], ["P01", "pack", 60]], 2);
seedOrder(cleanOutlets[4], [["P03", "karton", 6], ["P04", "pack", 20]]);
const otherOutlets = OUTLETS.filter((o) => o.branchId !== "SBY" && o.status === "lama_beli");
seedOrder(otherOutlets[0], [["P01", "karton", 8], ["P02", "karton", 5]]);
seedOrder(otherOutlets[12], [["P06", "karton", 2], ["P12", "pcs", 6]], 3);
seedOrder(otherOutlets[30], [["P05", "karton", 20]]);
// some already processed (Variant A: SO draft already in Odoo)
ORDERS[6].status = "SO Draft di Odoo";
ORDERS[6].soNumber = "SO/UP/2611/00871";
ORDERS[9].status = "Dikonfirmasi di Odoo";
ORDERS[9].soNumber = "SO/UP/2611/00866";

export function nextOrderSeq() {
  return orderSeq++;
}

/* ---------- approvals ---------- */
export const APPROVALS: ApprovalRequest[] = [];
let apvSeq = 1;
export function nextApprovalNo(prefix: string) {
  const n = apvSeq++;
  return { id: `APV${n}`, no: `${prefix}-2611-${String(n).padStart(3, "0")}` };
}
export function outletTotal(o: Order) {
  const gross = o.items.reduce((a, i) => a + i.qty * i.price, 0);
  return Math.round(gross * (1 - o.discountPct / 100));
}

export const DEFAULT_SETTINGS: Settings = {
  variant: "A",
  pipelineStageApproval: false,
  pipelineBatalApproval: true,
  existingCustomerPipeline: false,
  overdueDays: 30,
  approvalTrigger: "auto",
  discountTierMode: "single",
  discountBasis: "order",
  creditApprover: "finance_or_bm",
  slaHours: 24,
  salesAdminReview: true,
  orderWithoutVisitHQ: true,
  nooOrderBeforeFinance: false,
  minOrder: false,
  geofenceM: 100,
  classFreq: { A: "F4", B: "F2", C: "F1" },
  belumBeliFreq: "F2",
  spvEditPjpDirect: true,
  loa: [
    { role: "sales_admin", label: "Sales (tanpa approval)", max: 2 },
    { role: "spv", label: "Sales SPV", max: 5 },
    { role: "bm", label: "Branch Manager", max: 10 },
    { role: "cd", label: "Commercial Director", max: null },
  ],
};

/* ---------- targets & activity ---------- */
export const TARGETS_SALES: TargetRow[] = SALESMEN.map((s) => {
  const target = between(12, 40) * 10_000_000;
  return { key: s.id, month: CURRENT_MONTH, target, actual: Math.round(target * (0.35 + rnd() * 0.45)) };
});
export const TARGETS_BRANCH: TargetRow[] = BRANCHES.map((b) => {
  const sum = TARGETS_SALES.filter((t) => SALESMEN.find((s) => s.id === t.key)!.branchId === b.id);
  return { key: b.id, month: CURRENT_MONTH, target: sum.reduce((a, t) => a + t.target, 0), actual: sum.reduce((a, t) => a + t.actual, 0) };
});
export const TARGETS_PRODUCT: TargetRow[] = PRODUCTS.map((p) => {
  const target = between(15, 120) * 10_000_000;
  const actual = Math.round(target * (0.3 + rnd() * 0.5));
  const unit = p.uoms[0].price;
  return { key: p.id, month: CURRENT_MONTH, target, actual, targetQty: Math.round(target / unit), actualQty: Math.round(actual / unit) };
});
export const CATEGORIES = Array.from(new Set(PRODUCTS.map((p) => p.category)));
export const TARGETS_CATEGORY: TargetRow[] = CATEGORIES.map((c) => {
  const rows = TARGETS_PRODUCT.filter((t) => PRODUCTS.find((p) => p.id === t.key)!.category === c);
  return {
    key: c,
    month: CURRENT_MONTH,
    target: rows.reduce((a, r) => a + r.target, 0),
    actual: rows.reduce((a, r) => a + r.actual, 0),
    targetQty: rows.reduce((a, r) => a + (r.targetQty ?? 0), 0),
    actualQty: rows.reduce((a, r) => a + (r.actualQty ?? 0), 0),
  };
});

export interface VisitStat {
  salesId: string;
  planned: number;
  actual: number;
  effective: number;
  extra: number;
}
export const VISITS: VisitStat[] = SALESMEN.map((s) => {
  const planned = between(70, 110);
  const actual = Math.round(planned * (0.72 + rnd() * 0.25));
  return { salesId: s.id, planned, actual, effective: Math.round(actual * (0.45 + rnd() * 0.3)), extra: between(2, 9) };
});

/* ---------- users (synced from MileApp) ---------- */
export const USERS: ModuleUser[] = [
  { id: "U1", name: "Rina Kusuma", email: "rina.kusuma@unggulplastik.co.id", role: "admin", active: true, syncedAt: "2026-11-17 06:00" },
  { id: "U2", name: "Hendra Wijaya", email: "hendra.wijaya@unggulplastik.co.id", role: "cd", active: true, syncedAt: "2026-11-17 06:00" },
  { id: "U3", name: "Budi Santoso", email: "budi.santoso@unggulplastik.co.id", role: "bm", branchId: "SBY", active: true, syncedAt: "2026-11-17 06:00" },
  { id: "U4", name: "Dewi Lestari", email: "dewi.lestari@unggulplastik.co.id", role: "spv", branchId: "SBY", spvId: "SPV-SBY-1", active: true, syncedAt: "2026-11-17 06:00" },
  { id: "U5", name: "Sari Anggraini", email: "sari.anggraini@unggulplastik.co.id", role: "sales_admin", branchId: "SBY", active: true, syncedAt: "2026-11-17 06:00" },
  { id: "U6", name: "Agus Setiawan", email: "agus.setiawan@unggulplastik.co.id", role: "finance", active: true, syncedAt: "2026-11-17 06:00" },
  ...BRANCHES.filter((b) => b.id !== "SBY" && b.id !== "HQ").map((b, i) => ({
    id: `UB${i}`,
    name: personName(),
    email: `bm.${b.id.toLowerCase()}@unggulplastik.co.id`,
    role: "bm" as const,
    branchId: b.id,
    active: true,
    syncedAt: "2026-11-17 06:00",
  })),
  ...SPVS.filter((s) => s.id !== "SPV-SBY-1").map((s, i) => ({
    id: `US${i}`,
    name: s.name,
    email: `${s.name.toLowerCase().replace(/\s+/g, ".")}@unggulplastik.co.id`,
    role: "spv" as const,
    branchId: s.branchId,
    spvId: s.id,
    active: true,
    syncedAt: "2026-11-17 06:00",
  })),
];

/* ---------- data sync (Variant A) & import (Variant B) ---------- */
export const SYNC_DOMAINS: SyncDomain[] = [
  { key: "partner", name: "Pelanggan (res.partner)", direction: "Odoo → Modul", schedule: "Tiap 15 menit", lastSync: "2026-11-17 10:45", records: OUTLETS.length, status: "ok", errors: 0 },
  { key: "product", name: "Produk", direction: "Odoo → Modul", schedule: "Tiap 1 jam", lastSync: "2026-11-17 10:00", records: PRODUCTS.length, status: "ok", errors: 0 },
  { key: "uom", name: "UoM & konversi", direction: "Odoo → Modul", schedule: "Harian 05:00", lastSync: "2026-11-17 05:00", records: 31, status: "ok", errors: 0 },
  { key: "pricelist", name: "Price list", direction: "Odoo → Modul", schedule: "Tiap 1 jam", lastSync: "2026-11-17 10:00", records: 248, status: "error", errors: 2 },
  { key: "receivable", name: "Piutang & limit kredit", direction: "Odoo → Modul", schedule: "Tiap 1 jam (+ cek saat kirim SO)", lastSync: "2026-11-17 10:30", records: 214, status: "ok", errors: 0 },
  { key: "so", name: "Pesanan → Sales Order", direction: "Modul → Odoo", schedule: "Real-time (saat konfirmasi)", lastSync: "2026-11-17 10:52", records: 86, status: "error", errors: 1 },
  { key: "so_status", name: "Status SO / invoice", direction: "Odoo → Modul", schedule: "Tiap 15 menit", lastSync: "2026-11-17 10:45", records: 86, status: "ok", errors: 0 },
  { key: "noo", name: "Pelanggan baru (NOO) → res.partner", direction: "Modul → Odoo", schedule: "Real-time (setelah approval)", lastSync: "2026-11-16 16:20", records: 9, status: "ok", errors: 0 },
];
export const SYNC_ERRORS: SyncError[] = [
  { id: "E1", domain: "pricelist", ref: "UP-GPP-16 / karton", message: "UoM 'karton' tidak ditemukan pada product.template (mapping UoM belum lengkap)", at: "2026-11-17 10:00", resolved: false },
  { id: "E2", domain: "pricelist", ref: "UP-STR-PE / pcs", message: "Harga 0 pada price list Grosir 2026 — dilewati", at: "2026-11-17 10:00", resolved: false },
  { id: "E3", domain: "so", ref: "SO-JKT-202611-0118", message: "Timeout 30 detik saat memanggil Odoo API (sale.order create)", at: "2026-11-17 10:52", resolved: false },
];
export const IMPORT_TEMPLATES = [
  { key: "customer", name: "Pelanggan", desc: "Kode, nama, alamat, cabang, sales, kelas, status beli" },
  { key: "product", name: "Produk & UoM", desc: "SKU, nama, kategori, UoM, konversi" },
  { key: "pricelist", name: "Price list", desc: "SKU, UoM, harga, berlaku mulai" },
  { key: "receivable", name: "Piutang & limit kredit", desc: "Kode pelanggan, limit, saldo, jatuh tempo" },
  { key: "order", name: "Pesanan", desc: "Export pesanan per periode / status" },
  { key: "target", name: "Target", desc: "Target per sales / cabang / produk per bulan" },
];
export const IMPORT_LOGS: ImportLog[] = [
  { id: "L1", kind: "Import", template: "Pelanggan", file: "import-awal-pelanggan-odoo.xlsx", by: "Rina Kusuma", at: "2026-11-02 09:10", accepted: 2184, rejected: 37 },
  { id: "L2", kind: "Import", template: "Produk & UoM", file: "import-awal-produk.xlsx", by: "Rina Kusuma", at: "2026-11-02 09:25", accepted: 412, rejected: 0 },
  { id: "L3", kind: "Import", template: "Piutang & limit kredit", file: "piutang-per-161126.xlsx", by: "Agus Setiawan", at: "2026-11-16 17:02", accepted: 1961, rejected: 4 },
  { id: "L4", kind: "Export", template: "Pesanan", file: "pesanan-sby-nov.xlsx", by: "Sari Anggraini", at: "2026-11-16 17:30", accepted: 128, rejected: 0 },
];

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  baru: "Pelanggan Baru",
  lama_beli: "Pelanggan Lama – sudah beli",
  lama_belum: "Pelanggan Lama – belum beli",
};

/* ---------- territory (module 03) ---------- */
export const REGIONS: Region[] = [
  { id: "RG-W", name: "Region Barat", branchIds: ["JKT", "TGR", "BDG", "MDN", "PLG", "HQ"], active: true },
  { id: "RG-E", name: "Region Timur", branchIds: ["SMG", "SBY", "MKS", "DPS"], active: true },
];
BRANCHES.forEach((b) => {
  b.regionId = REGIONS.find((r) => r.branchIds.includes(b.id))?.id;
  b.active = true;
});
const AREAS = ["Pusat Kota", "Pasar & Pergudangan", "Kawasan Industri"];
export const ROUTES: Route[] = BRANCHES.flatMap((b) =>
  [1, 2, 3].map((i) => ({
    id: `R-${b.id}-${i}`,
    code: `${b.id}-R${i}`,
    name: `${b.city} ${AREAS[i - 1]}`,
    branchId: b.id,
    salesId: SALESMEN.filter((s) => s.branchId === b.id)[i - 1]?.id,
    area: AREAS[i - 1],
    active: true,
  }))
);

/* ---------- price lists (module 02) ---------- */
export const PRICE_GROUPS = ["Retail", "Grosir", "Horeka / Industri"];
export const PRICE_LISTS: PriceList[] = [
  { id: "PL1", name: "Retail 2026", channel: "Retail", regionId: "all", validFrom: "2026-01-01", active: true, items: PRODUCTS.flatMap((p) => p.uoms.map((u) => ({ productId: p.id, uom: u.uom, price: u.price }))) },
  { id: "PL2", name: "Grosir 2026", channel: "Grosir", regionId: "all", validFrom: "2026-01-01", active: true, items: PRODUCTS.flatMap((p) => p.uoms.map((u) => ({ productId: p.id, uom: u.uom, price: Math.round((u.price * 0.96) / 100) * 100 }))) },
  { id: "PL3", name: "Horeka / Industri – Timur", channel: "Horeka / Industri", regionId: "RG-E", validFrom: "2026-07-01", active: true, items: PRODUCTS.slice(0, 9).flatMap((p) => p.uoms.map((u) => ({ productId: p.id, uom: u.uom, price: Math.round((u.price * 0.98) / 100) * 100 }))) },
  { id: "PL4", name: "Promo Akhir Tahun – Barat", channel: "Retail", regionId: "RG-W", validFrom: "2026-11-01", validTo: "2026-12-31", active: false, items: PRODUCTS.slice(0, 4).map((p) => ({ productId: p.id, uom: p.uoms[0].uom, price: Math.round((p.uoms[0].price * 0.93) / 100) * 100 })) },
];

/* ---------- PJP change requests (module 04) ---------- */
export const PJP_REQUESTS: PjpChangeRequest[] = (() => {
  const team = SALESMEN.filter((s) => s.spvId === "SPV-SBY-1");
  const o0 = OUTLETS.filter((o) => o.salesId === team[0].id);
  const o1 = OUTLETS.filter((o) => o.salesId === team[1].id);
  return [
    { id: "PCR1", salesId: team[0].id, outletId: o0[o0.length - 1].id, kind: "Tambah", detail: "Rabu · F2 (M1, M3)", reason: "Outlet mulai order rutin", requestedBy: team[0].name, at: "2026-11-17 07:40", status: "pending" },
    { id: "PCR2", salesId: team[1].id, outletId: o1[2].id, kind: "Ubah hari", detail: "Senin → Kamis", reason: "Pemilik hanya ada di toko hari Kamis", requestedBy: team[1].name, at: "2026-11-16 16:05", status: "pending" },
    { id: "PCR3", salesId: team[0].id, outletId: o0[1].id, kind: "Hapus", detail: "Keluar dari PJP mulai minggu depan", reason: "Toko tutup permanen", requestedBy: team[0].name, at: "2026-11-14 10:20", status: "approved", decidedBy: "Dewi Lestari", decisionReason: "Sudah dicek" },
  ];
})();
