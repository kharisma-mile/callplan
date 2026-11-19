import { useMemo, useState, type ReactNode } from "react";
import { BarChart3, Download, FileSpreadsheet, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { ApprovalBadge, CustomerBadge, OrderBadge, StageBadge } from "@/components/status-badge";
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { BRANCHES, CURRENT_MONTH, PRODUCTS, SALESMEN, VISITS } from "@/data/mock";
import { APPROVAL_META } from "@/lib/rbac";
import { orderTotal } from "@/lib/approval";
import { fmtDate, fmtMonth, pct, rupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

type ReportKey =
  | "visit_report"
  | "call_compliance_report"
  | "order_report"
  | "approval_log"
  | "noo_report"
  | "pipeline_report"
  | "survey_report"
  | "target_achievement_report"
  | "outlet_report"
  | "adoption";

const REPORTS: { key: ReportKey; label: string; desc: string }[] = [
  { key: "visit_report", label: "Laporan Kunjungan", desc: "Kunjungan per salesman: rencana, aktual, effective call, extra call." },
  { key: "call_compliance_report", label: "Laporan Call Compliance", desc: "Kunjungan aktual ÷ rencana PJP (extra call tidak masuk penyebut)." },
  { key: "order_report", label: "Laporan Pesanan", desc: "Pesanan dari Mile Field per status, outlet, salesman dan nilai." },
  { key: "approval_log", label: "Log Approval", desc: "Setiap keputusan approval: pengguna, role, permission, waktu, alasan." },
  { key: "noo_report", label: "Laporan NOO", desc: "Registrasi pelanggan baru dan status request (verifikasi data approve_noo → kredit approve_noo_credit)." },
  { key: "pipeline_report", label: "Laporan Pipeline", desc: "Peluang per tahap, nilai estimasi, follow-up dan alasan batal." },
  { key: "survey_report", label: "Laporan Survey Kompetitor", desc: "Entri survey kompetitor dari kunjungan efektif (harga, merek, produk)." },
  { key: "target_achievement_report", label: "Laporan Pencapaian Target", desc: "Target vs aktual per salesman per bulan." },
  { key: "outlet_report", label: "Laporan Outlet", desc: "Master outlet dengan segmen, status beli, limit dan piutang." },
];

const MONTHS = ["2026-10", "2026-11", "2026-12"];
const COMPETITORS = ["Merek Lion Pack", "Merek Sinar Plas", "Merek Prima Kemasan", "Impor tanpa merek"];

/** deterministic pseudo-random from a string key */
function hash(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

interface Built {
  head: string[];
  rows: ReactNode[][];
  right?: number[];
}

export function ReportsPage() {
  const { can, roleMeta, user, inScope, scopeSalesIds, orders, outlets, approvals, opps, targets, settings, toast } = useApp();
  const visible = REPORTS.filter((r) => can(`view_any_${r.key}`));
  const canAdoption = can("view_any_adoption");
  const [active, setActive] = useState<ReportKey>(visible[0]?.key ?? "adoption");
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [branch, setBranch] = useState("all");
  const [sales, setSales] = useState("all");
  const scopeAll = roleMeta(user?.role).scope === "all";

  const salesList = SALESMEN.filter((s) => scopeSalesIds.includes(s.id) && (branch === "all" || s.branchId === branch));
  const pickSales = (salesId: string) => inScope(salesId) && (branch === "all" || salesOf(salesId).branchId === branch) && (sales === "all" || salesId === sales);

  const built: Built = useMemo(() => {
    const monthFactor = month === CURRENT_MONTH ? 1 : month < CURRENT_MONTH ? 1.12 : 0;
    switch (active) {
      case "visit_report":
      case "call_compliance_report": {
        const rows = VISITS.filter((v) => pickSales(v.salesId)).map((v) => {
          const planned = Math.round(v.planned * (monthFactor || 1));
          const actual = Math.round(v.actual * monthFactor);
          const eff = Math.round(v.effective * monthFactor);
          return { v, planned, actual, eff };
        });
        if (active === "visit_report")
          return {
            head: ["No.", "Sales", "Cabang", "Rencana", "Aktual", "Effective call", "Extra call"],
            right: [3, 4, 5, 6],
            rows: rows.map((r, i) => [i + 1, salesOf(r.v.salesId).name, branchOf(salesOf(r.v.salesId).branchId).name, r.planned, r.actual, `${r.eff} (${pct(r.eff, r.actual)}%)`, Math.round(r.v.extra * (monthFactor || 0))]),
          };
        return {
          head: ["No.", "Sales", "Cabang", "Rencana PJP", "Dikunjungi", "Compliance", "Status"],
          right: [3, 4, 5],
          rows: rows
            .sort((a, b) => a.actual / a.planned - b.actual / b.planned)
            .map((r, i) => {
              const c = pct(r.actual, r.planned);
              return [
                i + 1,
                salesOf(r.v.salesId).name,
                branchOf(salesOf(r.v.salesId).branchId).name,
                r.planned,
                r.actual,
                `${c}%`,
                <Badge key="b" variant={c >= 85 ? "success" : c >= 70 ? "warning" : "danger"}>{c >= 85 ? "Sesuai target" : "Di bawah 85%"}</Badge>,
              ];
            }),
        };
      }
      case "order_report": {
        const list = month === CURRENT_MONTH ? orders.filter((o) => pickSales(o.salesId)) : [];
        return {
          head: ["No.", "No. pesanan", "Tanggal", "Outlet", "Sales", "Status", "Total"],
          right: [6],
          rows: list.map((o, i) => [i + 1, o.no, fmtDate(o.date), outlets.find((x) => x.id === o.outletId)?.name ?? "—", salesOf(o.salesId).name, <OrderBadge key="s" s={o.status} />, rupiah(orderTotal(o))]),
        };
      }
      case "approval_log": {
        const list = approvals
          .filter((a) => pickSales(a.salesId) && (month === CURRENT_MONTH || a.createdAt.startsWith(month)))
          .flatMap((a) => a.audit.map((e) => ({ a, e })))
          .sort((x, y) => y.e.at.localeCompare(x.e.at));
        return {
          head: ["No.", "Waktu", "Permintaan", "Jenis", "Pengguna", "Aksi", "Permission", "Alasan"],
          rows: list.map(({ a, e }, i) => [
            i + 1,
            fmtDate(e.at),
            `${a.no} · ${a.outletName}`,
            APPROVAL_META[a.type].short,
            `${e.by} (${e.role})`,
            e.action,
            <span key="p" className="font-mono text-[11px]">{e.permission ?? "—"}</span>,
            e.reason || "—",
          ]),
        };
      }
      case "noo_report": {
        const list = approvals.filter((a) => a.type === "noo" && pickSales(a.salesId) && (month === CURRENT_MONTH || a.createdAt.startsWith(month)));
        return {
          head: ["No.", "No. NOO", "Pelanggan", "Sales", "Diajukan", "Tahap", "Status"],
          rows: list.map((a, i) => {
            const step = a.steps.find((s) => s.status === "pending");
            return [i + 1, a.no, a.outletName, salesOf(a.salesId).name, fmtDate(a.createdAt), step ? `Menunggu: ${step.label}` : "Selesai", <ApprovalBadge key="s" s={a.status} />];
          }),
        };
      }
      case "pipeline_report": {
        const list = opps.filter((o) => pickSales(o.salesId));
        return {
          head: ["No.", "Peluang", "Jenis", "Sales", "Tahap", "Estimasi nilai", "Follow-up / alasan batal"],
          right: [5],
          rows: list.map((o, i) => [
            i + 1,
            o.name,
            o.type,
            salesOf(o.salesId).name,
            <StageBadge key="s" s={o.stage} />,
            rupiah(o.value),
            o.stage === "Batal" ? o.batalReason ?? "—" : o.stage === "Menang" ? "—" : `${o.nextKind} · ${fmtDate(o.nextDate)}`,
          ]),
        };
      }
      case "survey_report": {
        const list = VISITS.filter((v) => pickSales(v.salesId)).flatMap((v) => {
          const n = Math.round(1 + hash(v.salesId + month) * 3);
          return Array.from({ length: n }, (_, k) => {
            const p = PRODUCTS[Math.floor(hash(`${v.salesId}${k}${month}p`) * PRODUCTS.length)];
            const comp = COMPETITORS[Math.floor(hash(`${v.salesId}${k}c`) * COMPETITORS.length)];
            const diff = Math.round((hash(`${v.salesId}${k}d`) - 0.6) * 12);
            return { v, p, comp, diff, day: 1 + Math.floor(hash(`${v.salesId}${k}t`) * 16) };
          });
        });
        return {
          head: ["No.", "Tanggal", "Sales", "Produk UP", "Kompetitor", "Harga kompetitor vs UP"],
          rows: list.map((r, i) => [
            i + 1,
            fmtDate(`${month}-${String(r.day).padStart(2, "0")}`),
            salesOf(r.v.salesId).name,
            r.p.name,
            r.comp,
            <span key="d" className={r.diff < 0 ? "font-semibold text-[#BF2130]" : ""}>{r.diff > 0 ? "+" : ""}{r.diff}%</span>,
          ]),
        };
      }
      case "target_achievement_report": {
        const list = targets.sales.filter((t) => t.month === month && pickSales(t.key));
        return {
          head: ["No.", "Sales", "Cabang", "Target", "Aktual", "Pencapaian"],
          right: [3, 4, 5],
          rows: list.map((t, i) => [i + 1, salesOf(t.key).name, branchOf(salesOf(t.key).branchId).name, rupiah(t.target), rupiah(t.actual), `${pct(t.actual, t.target)}%`]),
        };
      }
      case "outlet_report": {
        const list = outlets.filter((o) => pickSales(o.salesId));
        return {
          head: ["No.", "Kode", "Outlet", "Sales", "Segmen", "Status", "Limit kredit", "Piutang"],
          right: [6, 7],
          rows: list.map((o, i) => [i + 1, o.code, `${o.name}${o.active ? "" : " (nonaktif)"}`, salesOf(o.salesId).name, o.segment, <CustomerBadge key="c" s={o.status} />, rupiah(o.creditLimit), rupiah(o.outstanding)]),
        };
      }
      default:
        return { head: [], rows: [] };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, month, branch, sales, orders, outlets, approvals, opps, targets, inScope]);

  const exportExcel = (label: string, n: number) => {
    const file = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${month}.xlsx`;
    if (n > 5000) toast({ tone: "info", title: "Export sedang diproses", desc: "File tersedia di Riwayat Export (disimpan 7 hari)." });
    else toast({ tone: "success", title: `Export Excel dibuat — ${file}`, desc: `${n} baris · sesuai filter dan cakupan data Anda` });
  };

  if (visible.length === 0 && !canAdoption) return <EmptyState title="Tidak ada laporan" desc="Role Anda belum punya permission laporan." />;

  const meta = REPORTS.find((r) => r.key === active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan"
        subtitle="Laporan standar sesuai cakupan data Anda. Export Excel ≤ 5.000 baris langsung diunduh; lebih dari itu diproses di background dan file disimpan 7 hari."
      />

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardContent className="space-y-1 p-2">
            {visible.map((r) => (
              <button
                key={r.key}
                onClick={() => setActive(r.key)}
                className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm", active === r.key ? "bg-accent font-semibold text-[#016C9D]" : "hover:bg-muted")}
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" /> {r.label}
              </button>
            ))}
            {canAdoption && (
              <button
                onClick={() => setActive("adoption")}
                className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm", active === "adoption" ? "bg-accent font-semibold text-[#016C9D]" : "hover:bg-muted")}
              >
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" /> Adopsi Aplikasi
              </button>
            )}
          </CardContent>
        </Card>

        {active === "adoption" ? (
          <AdoptionView onExport={exportExcel} canExport={can("export_data")} variant={settings.variant} scopeAll={scopeAll} />
        ) : (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 border-b border-border">
              <div>
                <CardTitle className="text-base">{meta?.label}</CardTitle>
                <p className="text-xs text-muted-foreground">{meta?.desc}</p>
              </div>
              {can("export_data") && (
                <Button variant="outline" onClick={() => exportExcel(meta?.label ?? "laporan", built.rows.length)}>
                  <Download /> Export Excel
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {fmtMonth(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {scopeAll && (
                <Select
                  value={branch}
                  onValueChange={(v) => {
                    setBranch(v);
                    setSales("all");
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua cabang</SelectItem>
                    {BRANCHES.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={sales} onValueChange={setSales}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua sales ({salesList.length})</SelectItem>
                  {salesList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="neutral" className="ml-auto">
                {built.rows.length} baris
              </Badge>
            </CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {built.head.map((h, i) => (
                    <TableHead key={h} className={cn(i === 0 && "w-12", built.right?.includes(i) && "text-right")}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {built.rows.slice(0, 100).map((r, i) => (
                  <TableRow key={i}>
                    {r.map((c, j) => (
                      <TableCell key={j} className={cn("text-sm", built.right?.includes(j) && "text-right")}>
                        {c}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {built.rows.length === 0 && <EmptyState title="Data tidak ditemukan" desc="Ubah periode atau filter." />}
            {built.rows.length > 100 && <p className="p-4 text-center text-xs text-muted-foreground">Pratinjau 100 dari {built.rows.length} baris · export berisi semua baris</p>}
          </Card>
        )}
      </div>
    </div>
  );
}

function AdoptionView({ onExport, canExport, variant, scopeAll }: { onExport: (l: string, n: number) => void; canExport: boolean; variant: "A" | "B"; scopeAll: boolean }) {
  const { scopeSalesIds } = useApp();
  const rows = useMemo(() => {
    if (scopeAll)
      return BRANCHES.map((b, i) => {
        const n = SALESMEN.filter((s) => s.branchId === b.id).length;
        const active = Math.round(n * (0.72 + hash(b.id) * 0.28));
        const viaApp = Math.round(120 + hash(b.id + "o") * 260);
        const total = Math.round(viaApp / (0.55 + hash(b.id + "t") * 0.4));
        return { label: b.name, sub: `Go-live ${fmtDate(`2026-${i < 5 ? "10" : "11"}-0${(i % 5) + 2}`)}`, n, active, viaApp, total };
      });
    return SALESMEN.filter((s) => scopeSalesIds.includes(s.id)).map((s) => {
      const days = 13;
      const active = Math.round(days * (0.7 + hash(s.id) * 0.3));
      const viaApp = Math.round(10 + hash(s.id + "o") * 30);
      const total = Math.round(viaApp / (0.55 + hash(s.id + "t") * 0.4));
      return { label: s.name, sub: s.code, n: days, active, viaApp, total };
    });
  }, [scopeAll, scopeSalesIds]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 border-b border-border">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" /> Adopsi Aplikasi {scopeAll ? "per cabang" : "per salesman"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Sales aktif = ≥ 1 check-in atau pesanan per hari kerja. % pesanan via app = pesanan Mile Field ÷{" "}
            {variant === "A" ? "total SO di Odoo (sinkron)" : "total pesanan bulanan (input Admin)"}. Target usulan: aktif ≥ 90% (2 bulan), via app ≥ 70% (3 bulan).
          </p>
        </div>
        {canExport && (
          <Button variant="outline" onClick={() => onExport("adopsi-aplikasi", rows.length)}>
            <Download /> Export Excel
          </Button>
        )}
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead>{scopeAll ? "Cabang" : "Sales"}</TableHead>
            <TableHead className="text-right">{scopeAll ? "Sales aktif hari ini" : "Hari aktif (MTD)"}</TableHead>
            <TableHead className="w-[200px]">% aktif (target ≥ 90%, usulan)</TableHead>
            <TableHead className="text-right">Pesanan via app / total</TableHead>
            <TableHead className="w-[200px]">% via app (target ≥ 70%, usulan)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const a = pct(r.active, r.n);
            const o = pct(r.viaApp, r.total);
            return (
              <TableRow key={r.label}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <p className="font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.sub}</p>
                </TableCell>
                <TableCell className="text-right">
                  {r.active} / {r.n}
                </TableCell>
                <TableCell>
                  <Meter value={a} target={90} />
                </TableCell>
                <TableCell className="text-right">
                  {r.viaApp} / {r.total}
                  {variant === "B" && <span className="block text-[11px] text-muted-foreground">penyebut: input Admin</span>}
                </TableCell>
                <TableCell>
                  <Meter value={o} target={70} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function Meter({ value, target }: { value: number; target: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[#E8E8E8]">
        <div className={cn("h-full rounded-full", value >= target ? "bg-[#198754]" : "bg-[#FFC105]")} style={{ width: `${Math.min(100, value)}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-[#141414]" style={{ left: `${target}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold">{value}%</span>
    </div>
  );
}
