import type { ApprovalStep, ApprovalType, LoaTier, Order, Outlet, Settings } from "@/data/types";
import { productById } from "@/data/mock";

/** Which LOA tier a discount % falls into. Returns null when Sales may give it without approval (tier without permission). */
export function loaTierFor(pctValue: number, loa: LoaTier[]): LoaTier | null {
  for (let i = 0; i < loa.length; i++) {
    const t = loa[i];
    if (t.max === null || pctValue <= t.max) return t.permission ? t : null;
  }
  const last = loa[loa.length - 1];
  return last?.permission ? last : null;
}

/** Band text of tier i, e.g. "2–5%", "> 5%", "≤ 2%". */
export function loaBand(loa: LoaTier[], i: number): string {
  const t = loa[i];
  const prev = i === 0 ? 0 : loa[i - 1].max ?? 0;
  return t.max === null ? `> ${prev}%` : i === 0 ? `≤ ${t.max}%` : `${prev}–${t.max}%`;
}

/** D-54: fixed multi-step chains (ordered steps, each = one permission). Configured per deployment. */
export const APPROVAL_CHAINS: Record<"special_order" | "noo" | "credit_override" | "pipeline_stage", { label: string; permission: string }[]> = {
  special_order: [
    { label: "Review harga khusus", permission: "approve_special_order" },
    { label: "Persetujuan final", permission: "approve_special_order_final" },
  ],
  noo: [
    { label: "Verifikasi data", permission: "approve_noo" },
    { label: "Kredit pelanggan", permission: "approve_noo_credit" },
  ],
  credit_override: [{ label: "Kelonggaran limit kredit", permission: "approve_credit_override" }],
  pipeline_stage: [{ label: "Perpindahan tahap", permission: "approve_pipeline_stage" }],
};

/** Every permission that can decide some step of a request type (header pills, permission hints). */
export function approvalPerms(type: ApprovalType, settings: Settings): string[] {
  if (type === "discount") return settings.loa.map((t) => t.permission).filter((x): x is string => !!x);
  return APPROVAL_CHAINS[type].map((s) => s.permission);
}

/** Permissions accepted for a step (its own + alternatives such as higher LOA tiers). */
export const stepPerms = (s: ApprovalStep) => [s.permission, ...(s.alsoPermissions ?? [])];

/** Step badge text: "Tier 1 (2–5%)" or "Langkah 2 · Kredit pelanggan". */
export function stepTitle(steps: ApprovalStep[], i: number): string {
  return steps.length > 1 ? `Langkah ${i + 1} · ${steps[i].label}` : steps[i].label;
}

/** "Penyetuju: pemegang permission …" */
export function stepApproverText(s: ApprovalStep): string {
  return `Penyetuju: pemegang permission ${s.permission}${s.alsoPermissions?.length ? ` (atau ${s.alsoPermissions.join(" / ")})` : ""}`;
}

/** D-54: steps are permissions, never role names. A pending step goes to every user whose role holds the step's permission
 *  and whose data scope covers the request. Discount: the covering LOA tier (single, higher tiers may also decide)
 *  or every tier from the first approval tier up to the covering one (sequential). */
export function buildSteps(type: ApprovalType, opts: { discountPct?: number; settings: Settings }): ApprovalStep[] {
  const { settings } = opts;
  const mk = (s: { label: string; permission: string; alsoPermissions?: string[] }, i: number): ApprovalStep => ({ ...s, status: i === 0 ? "pending" : "waiting" });
  if (type === "discount") {
    const loa = settings.loa;
    const cover = loaTierFor(opts.discountPct ?? 0, loa);
    const ci = cover ? loa.indexOf(cover) : loa.findIndex((t) => t.permission);
    const tierStep = (i: number) => ({ label: `${loa[i].label} (${loaBand(loa, i)})`, permission: loa[i].permission! });
    if (ci < 0) return [];
    if (settings.discountTierMode === "sequential") {
      const idx = loa.map((t, i) => i).filter((i) => i <= ci && loa[i].permission);
      return idx.map((i, k) => mk(tierStep(i), k));
    }
    const higher = loa.slice(ci + 1).map((t) => t.permission).filter((x): x is string => !!x);
    return [mk({ ...tierStep(ci), alsoPermissions: higher.length ? higher : undefined }, 0)];
  }
  return APPROVAL_CHAINS[type].map(mk);
}

export interface OrderCheck {
  key: ApprovalType | "uom";
  ok: boolean;
  label: string;
  detail: string;
  needs?: ApprovalType;
}

export function orderGross(o: Order) {
  return o.items.reduce((a, i) => a + i.qty * i.price, 0);
}
export function orderTotal(o: Order) {
  return Math.round(orderGross(o) * (1 - o.discountPct / 100));
}

export function listPrice(productId: string, uom: string) {
  return productById(productId).uoms.find((u) => u.uom === uom)?.price;
}

export function checkOrder(o: Order, outlet: Outlet, settings: Settings): OrderCheck[] {
  const checks: OrderCheck[] = [];
  const priceDev = o.items.filter((i) => listPrice(i.productId, i.uom) !== i.price);
  checks.push({
    key: "special_order",
    ok: priceDev.length === 0 || o.approvedTypes.includes("special_order"),
    label: "Harga sesuai price list",
    detail:
      priceDev.length === 0
        ? "Semua item sesuai price list aktif"
        : o.approvedTypes.includes("special_order")
          ? "Harga khusus sudah disetujui"
          : `${priceDev.length} item di luar price list → perlu Request Pesanan Khusus`,
    needs: priceDev.length && !o.approvedTypes.includes("special_order") ? "special_order" : undefined,
  });
  const badUom = o.items.filter((i) => listPrice(i.productId, i.uom) === undefined);
  checks.push({
    key: "uom",
    ok: badUom.length === 0,
    label: "UoM valid",
    detail: badUom.length === 0 ? "Semua UoM terdaftar pada produk" : `${badUom.length} UoM tidak terdaftar`,
  });
  const salesMax = settings.loa[0]?.max ?? 0;
  const discNeeds = o.discountPct > salesMax && !o.approvedTypes.includes("discount");
  checks.push({
    key: "discount",
    ok: !discNeeds,
    label: `Diskon dalam kewenangan Sales (≤ ${salesMax}%)`,
    detail:
      o.discountPct === 0
        ? "Tanpa diskon"
        : discNeeds
          ? `Diskon ${o.discountPct}% → perlu Request Diskon (LOA)`
          : o.discountPct > salesMax
            ? `Diskon ${o.discountPct}% sudah disetujui`
            : `Diskon ${o.discountPct}%`,
    needs: discNeeds ? "discount" : undefined,
  });
  const total = orderTotal(o);
  const over = outlet.outstanding + total > outlet.creditLimit;
  const overdue = outlet.overdueDays > settings.overdueDays;
  const creditNeeds = (over || overdue) && !o.approvedTypes.includes("credit_override");
  checks.push({
    key: "credit_override",
    ok: !creditNeeds,
    label: "Limit kredit & piutang",
    detail: o.approvedTypes.includes("credit_override")
      ? "Kelonggaran limit kredit sudah disetujui"
      : overdue
        ? `Piutang jatuh tempo ${outlet.overdueDays} hari (> ${settings.overdueDays} hari) → perlu Request Limit Kredit`
        : over
          ? "Saldo piutang + pesanan melebihi limit kredit → perlu Request Limit Kredit"
          : "Masih dalam limit kredit",
    needs: creditNeeds ? "credit_override" : undefined,
  });
  return checks;
}
