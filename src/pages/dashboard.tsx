import { useMemo } from "react";
import { AlarmClock, ClipboardCheck, PackageCheck, Footprints, GitBranch, Target, Zap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SetupGuide } from "@/components/setup-guide";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StageBadge } from "@/components/status-badge";
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { BRANCHES, CURRENT_MONTH, PRODUCTS, SALESMEN, TODAY, VISITS } from "@/data/mock";
import { APPROVAL_META } from "@/lib/rbac";
import { fmtDate, fmtMonth, pct, rupiahShort } from "@/lib/format";
import type { OppStage } from "@/data/types";

const STAGES: OppStage[] = ["Prospek", "Dijadwalkan", "Kunjungan & Negosiasi", "Menang", "Batal"];

function Bar({ label, sub, actual, target, tone = "primary" }: { label: string; sub?: string; actual: number; target: number; tone?: "primary" | "orange" }) {
  const p = pct(actual, target);
  const color = tone === "orange" ? "bg-[#E45C20]" : p >= 70 ? "bg-[#198754]" : p >= 50 ? "bg-primary" : "bg-[#FFC105]";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {sub ?? `${rupiahShort(actual)} / ${rupiahShort(target)}`} · <b className="text-foreground">{p}%</b>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#E8E8E8]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
    </div>
  );
}

export function DashboardPage({ onNavigate }: { onNavigate: (k: string) => void }) {
  const { user, scopeSalesIds, inScope, targets, opps, approvals, orders, canActOnStep, scopeLabel, roleMeta, can } = useApp();
  const showOverdue = user!.role === "spv" || user!.role === "bm";
  const role = user!.role;
  const scope = roleMeta(role).scope;

  const data = useMemo(() => {
    const salesT = targets.sales.filter((t) => t.month === CURRENT_MONTH && inScope(t.key));
    const target = salesT.reduce((a, t) => a + t.target, 0);
    const actual = salesT.reduce((a, t) => a + t.actual, 0);
    const visits = VISITS.filter((v) => inScope(v.salesId));
    const planned = visits.reduce((a, v) => a + v.planned, 0);
    const done = visits.reduce((a, v) => a + v.actual, 0);
    const eff = visits.reduce((a, v) => a + v.effective, 0);
    const myOpps = opps.filter((o) => inScope(o.salesId));
    const open = myOpps.filter((o) => o.stage !== "Menang" && o.stage !== "Batal");
    const overdue = open.filter((o) => o.nextDate < TODAY).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    const pending = approvals.filter((a) => a.status === "pending" && inScope(a.salesId) && canActOnStep(a));
    return { salesT, target, actual, visits, planned, done, eff, myOpps, open, overdue, pending };
  }, [targets, inScope, opps, approvals, canActOnStep]);

  const breakdown =
    scope === "all"
      ? BRANCHES.map((b) => {
          const rows = data.salesT.filter((t) => salesOf(t.key).branchId === b.id);
          return { label: b.name, actual: rows.reduce((a, r) => a + r.actual, 0), target: rows.reduce((a, r) => a + r.target, 0) };
        })
      : data.salesT.map((t) => ({ label: salesOf(t.key).name, actual: t.actual, target: t.target }));

  const productRows = targets.product.filter((t) => t.month === CURRENT_MONTH);
  const scaleProduct = scope === "all" ? 1 : data.target / Math.max(1, targets.sales.filter((t) => t.month === CURRENT_MONTH).reduce((a, t) => a + t.target, 0));

  const stageStats = STAGES.map((s) => {
    const list = data.myOpps.filter((o) => o.stage === s);
    return { s, count: list.length, value: list.reduce((a, o) => a + o.value, 0) };
  });
  const maxStage = Math.max(1, ...stageStats.map((s) => s.value));
  const pendingByType = Object.keys(APPROVAL_META).map((t) => ({ t, n: data.pending.filter((p) => p.type === t).length })).filter((x) => x.n > 0);

  const topPending = [...pendingByType].sort((a, b) => b.n - a.n)[0]?.t;
  const firstApprovalPage = (Object.keys(APPROVAL_META) as (keyof typeof APPROVAL_META)[]).find((t) => can(`view_any_${APPROVAL_META[t].resource}`));
  const approvalTarget = topPending ?? firstApprovalPage;
  const reviewCount = orders.filter((o) => inScope(o.salesId) && o.status === "Menunggu Review").length;

  const lowCompliance = [...data.visits].sort((a, b) => a.actual / a.planned - b.actual / b.planned).slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Dashboard ${roleMeta(role).label}`}
        subtitle={`${scopeLabel} · ${fmtMonth(CURRENT_MONTH)} · data per ${fmtDate(TODAY)}`}
        action={<Badge variant="neutral">{scopeSalesIds.length} salesman dalam cakupan</Badge>}
      />

      <SetupGuide onNavigate={onNavigate} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={Target} label="Target vs Aktual" value={`${pct(data.actual, data.target)}%`} hint={`${rupiahShort(data.actual)} dari ${rupiahShort(data.target)}`} />
        <StatCard icon={Footprints} tone="success" label="Kunjungan vs Rencana" value={`${pct(data.done, data.planned)}%`} hint={`${data.done} dari ${data.planned} call (PJP)`} />
        <StatCard icon={Zap} tone="orange" label="Effective Call Ratio" value={`${pct(data.eff, data.done)}%`} hint={`${data.eff} kunjungan dengan pesanan`} />
        <StatCard icon={GitBranch} label="Pipeline aktif" value={String(data.open.length)} hint={rupiahShort(data.open.reduce((a, o) => a + o.value, 0)) + " estimasi"} onClick={() => onNavigate("pipeline")} />
        {showOverdue ? (
          <StatCard icon={AlarmClock} tone="danger" label="Follow-up terlambat" value={String(data.overdue.length)} hint="lewat tanggal follow-up" onClick={() => onNavigate("pipeline")} />
        ) : (
          <StatCard
            icon={PackageCheck}
            tone="danger"
            label="Pesanan menunggu review"
            value={String(reviewCount)}
            hint="antrian Sales Admin"
            onClick={can("view_any_order") ? () => onNavigate("orders") : undefined}
          />
        )}
        <StatCard
          icon={ClipboardCheck}
          tone="warning"
          label="Approval menunggu Anda"
          value={String(data.pending.length)}
          hint={pendingByType.map((p) => `${APPROVAL_META[p.t as keyof typeof APPROVAL_META].short} ${p.n}`).join(" · ") || "tidak ada"}
          onClick={approvalTarget ? () => onNavigate(`approval/${approvalTarget}`) : undefined}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Target vs aktual {scope === "all" ? "per cabang" : "per sales"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {breakdown.map((b) => (
              <Bar key={b.label} label={b.label} actual={b.actual} target={b.target} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline per tahap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stageStats.map((s) => (
              <div key={s.s} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <StageBadge s={s.s} />
                  <span className="text-xs text-muted-foreground">
                    <b className="text-foreground">{s.count}</b> peluang · {rupiahShort(s.value)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#E8E8E8]">
                  <div className={`h-full rounded-full ${s.s === "Batal" ? "bg-[#DC3545]" : s.s === "Menang" ? "bg-[#198754]" : "bg-primary"}`} style={{ width: `${(s.value / maxStage) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className={`grid gap-4 ${showOverdue ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Target vs aktual per produk</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {productRows.slice(0, 7).map((t) => (
              <Bar key={t.key} label={PRODUCTS.find((p) => p.id === t.key)!.name} actual={t.actual * scaleProduct} target={t.target * scaleProduct} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Call compliance terendah</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">No.</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead className="text-right">Visit</TableHead>
                  <TableHead className="text-right">EC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowCompliance.map((v, i) => (
                  <TableRow key={v.salesId}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>
                      <p className="font-medium">{salesOf(v.salesId).name}</p>
                      <p className="text-xs text-muted-foreground">{branchOf(salesOf(v.salesId).branchId).name}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      {v.actual}/{v.planned} <span className="text-xs text-muted-foreground">({pct(v.actual, v.planned)}%)</span>
                    </TableCell>
                    <TableCell className="text-right">{pct(v.effective, v.actual)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {showOverdue && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Follow-up terlambat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.overdue.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada follow-up terlambat</p>}
            {data.overdue.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{o.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {salesOf(o.salesId).name} · {o.nextKind}
                  </p>
                </div>
                <Badge variant="danger">{fmtDate(o.nextDate)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Sumber kunjungan dan effective call: hasil kunjungan Mile Field (webhook). {SALESMEN.length} salesman total, 9 cabang + HQ Direct Sales.
      </p>
    </div>
  );
}
