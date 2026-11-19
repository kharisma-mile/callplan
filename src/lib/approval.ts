import type { ApprovalStep, ApprovalType, LoaTier, Order, Outlet, RoleKey, Settings } from "@/data/types";
import { productById } from "@/data/mock";

/** Which LOA tier a discount % falls into. Returns null when Sales may give it without approval. */
export function loaTierFor(pctValue: number, loa: LoaTier[]): LoaTier | null {
  for (let i = 0; i < loa.length; i++) {
    const t = loa[i];
    if (t.max === null || pctValue <= t.max) return i === 0 ? null : t;
  }
  return loa[loa.length - 1];
}

/** D-52: two roles. Sales Supervisor decides within its tier; above it (and every second step) goes to Admin.
 *  Admin may always act on any step. Discount: single covering tier (default) or SPV → Admin when `sequential`. */
export function buildSteps(type: ApprovalType, opts: { discountPct?: number; settings: Settings }): ApprovalStep[] {
  const { settings } = opts;
  const mk = (label: string, roles: RoleKey[], first: boolean): ApprovalStep => ({ label, roles, status: first ? "pending" : "waiting" });
  const spv = (label: string, first = true) => mk(label, ["spv", "admin"], first);
  const admin = (label: string, first = true) => mk(label, ["admin"], first);
  switch (type) {
    case "discount": {
      const spvTier = settings.loa.find((t) => t.role === "spv");
      const spvLabel = `LOA: Sales Supervisor${spvTier?.max != null ? ` (≤ ${spvTier.max}%)` : ""}`;
      const aboveSpv = loaTierFor(opts.discountPct ?? 0, settings.loa)?.role === "admin";
      if (!aboveSpv) return [spv(spvLabel)];
      return settings.discountTierMode === "sequential" ? [spv(spvLabel), admin("LOA: Admin", false)] : [admin("LOA: Admin (di atas tier Supervisor)")];
    }
    case "special_order":
      return [spv("Sales Supervisor"), admin("Admin", false)];
    case "credit_override":
      return [settings.creditApprover === "admin" ? admin("Admin") : spv("Sales Supervisor")];
    case "noo":
      return [spv("Verifikasi data (Sales Supervisor)"), admin("Limit kredit, TOP & price group (Admin)", false)];
    case "pipeline_stage":
      return [spv("Sales Supervisor")];
  }
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
