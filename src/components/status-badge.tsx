import { Badge } from "@/components/ui/badge";
import type { CustomerStatus, OppStage, OrderStatus } from "@/data/types";
import { CUSTOMER_STATUS_LABEL } from "@/data/mock";

type V = "info" | "success" | "warning" | "danger" | "neutral" | "outline" | "orange";

const ORDER: Record<OrderStatus, V> = {
  "Menunggu Review": "warning",
  "Menunggu Approval": "orange",
  "Mengirim ke Odoo": "info",
  "Gagal Sinkron": "danger",
  "SO Draft di Odoo": "success",
  "Dikonfirmasi di Odoo": "success",
  Dikonfirmasi: "success",
  Diproses: "info",
  Selesai: "neutral",
  Dibatalkan: "danger",
  Ditolak: "danger",
};
const STAGE: Record<OppStage, V> = {
  Prospek: "neutral",
  Dijadwalkan: "info",
  "Kunjungan & Negosiasi": "warning",
  Menang: "success",
  Batal: "danger",
};
const CUST: Record<CustomerStatus, V> = { baru: "info", lama_beli: "success", lama_belum: "warning" };

export function OrderBadge({ s }: { s: OrderStatus }) {
  return <Badge variant={ORDER[s]}>{s}</Badge>;
}
export function StageBadge({ s }: { s: OppStage }) {
  return <Badge variant={STAGE[s]}>{s}</Badge>;
}
export function CustomerBadge({ s }: { s: CustomerStatus }) {
  return <Badge variant={CUST[s]}>{CUSTOMER_STATUS_LABEL[s]}</Badge>;
}
export function ApprovalBadge({ s }: { s: "pending" | "approved" | "rejected" }) {
  return s === "pending" ? <Badge variant="warning">Menunggu</Badge> : s === "approved" ? <Badge variant="success">Disetujui</Badge> : <Badge variant="danger">Ditolak</Badge>;
}
