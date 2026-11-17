import type { ApprovalStep, ApprovalType, LoaTier, Order, Outlet, RoleKey, Settings } from "@/data/types";
import { productById } from "@/data/mock";

const RANK: RoleKey[] = ["spv", "bm", "cd"];

/** Roles at or above a tier role in the discount hierarchy (Admin always may act). */
function atOrAbove(role: RoleKey): RoleKey[] {
  const i = RANK.indexOf(role);
  return [...(i < 0 ? RANK : RANK.slice(i)), "admin"];
}

/** Which LOA tier a discount % falls into. Returns null when Sales may give it without approval. */
export function loaTierFor(pctValue: number, loa: LoaTier[]): LoaTier | null {
  for (let i = 0; i < loa.length; i++) {
    const t = loa[i];
    if (t.max === null || pctValue <= t.max) return i === 0 ? null : t;
  }
  return loa[loa.length - 1];
}

const TIER_ROLE_LABEL: Partial<Record<RoleKey, string>> = { spv: "Sales SPV", bm: "Branch Manager", cd: "Commercial Director" };

/** Module 06 FR-003. Discount: one step at the single covering tier (PRD default; superiors may also decide),
 *  or one step per tier from SPV up to the covering tier when `discountTierMode = sequential`. */
export function buildSteps(type: ApprovalType, opts: { discountPct?: number; settings: Settings }): ApprovalStep[] {
  const { settings } = opts;
  const loa = settings.loa;
  const mk = (label: string, roles: RoleKey[], first: boolean): ApprovalStep => ({ label, roles, status: first ? "pending" : "waiting" });
  switch (type) {
    case "discount": {
      const tier = loaTierFor(opts.discountPct ?? 0, loa);
      const role = tier?.role ?? "spv";
      if (settings.discountTierMode === "sequential") {
        const upto = RANK.indexOf(role);
        return RANK.slice(0, upto + 1).map((r, i) => {
          const t = loa.find((x) => x.role === r);
          return mk(`LOA: ${TIER_ROLE_LABEL[r]}${t?.max != null ? ` (≤ ${t.max}%)` : ""}`, [r, "admin"], i === 0);
        });
      }
      const label = tier ? `LOA: ${tier.label}${tier.max !== null ? ` (≤ ${tier.max}%)` : ""}` : "LOA";
      return [mk(label, atOrAbove(role), true)];
    }
    case "special_order":
      return [mk("Branch Manager", ["bm", "admin"], true), mk("Commercial Director", ["cd", "admin"], false)];
    case "credit_override": {
      const roles: RoleKey[] =
        settings.creditApprover === "finance" ? ["finance", "admin"] : settings.creditApprover === "bm" ? ["bm", "admin"] : ["finance", "bm", "admin"];
      const label = settings.creditApprover === "finance" ? "Finance" : settings.creditApprover === "bm" ? "Branch Manager" : "Finance / Branch Manager";
      return [mk(label, roles, true)];
    }
    case "noo":
      return [mk("Verifikasi data (Sales SPV)", ["spv", "bm", "admin"], true), mk("Limit kredit, TOP & price group (Finance)", ["finance", "admin"], false)];
    case "pipeline_stage":
      return [mk("Sales SPV", ["spv", "bm", "admin"], true)];
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
          : `${priceDev.length} item di luar price list → perlu Approval Pesanan Khusus`,
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
          ? `Diskon ${o.discountPct}% → perlu Approval Diskon (LOA)`
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
        ? `Piutang jatuh tempo ${outlet.overdueDays} hari (> ${settings.overdueDays} hari) → perlu Approval Limit Kredit`
        : over
          ? "Saldo piutang + pesanan melebihi limit kredit → perlu Approval Limit Kredit"
          : "Masih dalam limit kredit",
    needs: creditNeeds ? "credit_override" : undefined,
  });
  return checks;
}
