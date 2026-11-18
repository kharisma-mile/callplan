import { useMemo, useState } from "react";
import { Check, CheckCircle2, Circle, Clock, Eye, ShieldAlert, X, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRICE_GROUPS } from "@/data/mock";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApprovalBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { APPROVAL_META, ROLE_META } from "@/lib/rbac";
import type { ApprovalRequest, ApprovalType } from "@/data/types";
import { fmtDate, nowStamp, rupiah } from "@/lib/format";

const hoursSince = (at: string) => (new Date(nowStamp().replace(" ", "T")).getTime() - new Date(at.replace(" ", "T")).getTime()) / 3600000;
import { cn } from "@/lib/utils";

function StepTimeline({ a }: { a: ApprovalRequest }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {a.steps.map((s, i) => {
        const Icon = s.status === "approved" ? CheckCircle2 : s.status === "rejected" ? XCircle : s.status === "pending" ? Clock : Circle;
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                s.status === "approved" && "border-[#82E8B9] bg-[#D8F8E9] text-[#115A38]",
                s.status === "rejected" && "border-[#F3B9BF] bg-[#FAE5E7] text-[#68121A]",
                s.status === "pending" && "border-[#FFDA6B] bg-[#FFF4D1] text-[#6B5000]",
                s.status === "waiting" && "border-border bg-muted text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="font-medium">{s.label}</span>
              {s.by && <span>· {s.by}</span>}
            </div>
            {i < a.steps.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        );
      })}
    </div>
  );
}

export function ApprovalPage({ type }: { type: ApprovalType }) {
  const { approvals, inScope, can, canActOnStep, decideApproval, settings, session, orders, opps } = useApp();
  const meta = APPROVAL_META[type];
  const [tab, setTab] = useState<"pending" | "done" | "all">("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ id: string; approve: boolean; reason: string; limit?: number; top?: number; priceGroup?: string } | null>(null);
  const decA = decision ? approvals.find((a) => a.id === decision.id) : undefined;
  /** NOO step 2 (Finance) must set credit limit, TOP and price group before approving (module 06 FR-010). */
  const needsCredit = !!decision?.approve && decA?.type === "noo" && decA.steps.findIndex((s) => s.status === "pending") === 1;
  const lateSla = (a: ApprovalRequest) => a.status === "pending" && hoursSince(a.createdAt) > settings.slaHours;
  const hasApprove = can(meta.perm);

  const list = useMemo(
    () =>
      approvals
        .filter((a) => a.type === type && inScope(a.salesId))
        .filter((a) => (tab === "pending" ? a.status === "pending" : tab === "done" ? a.status !== "pending" : true))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [approvals, type, inScope, tab]
  );
  const counts = {
    pending: approvals.filter((a) => a.type === type && inScope(a.salesId) && a.status === "pending").length,
    done: approvals.filter((a) => a.type === type && inScope(a.salesId) && a.status !== "pending").length,
  };
  const open = approvals.find((a) => a.id === openId) ?? null;

  const actionCell = (a: ApprovalRequest) => {
    if (a.status !== "pending") return <ApprovalBadge s={a.status} />;
    if (canActOnStep(a))
      return (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setDecision({ id: a.id, approve: true, reason: "" })}>
            <Check /> Setujui
          </Button>
          <Button size="sm" variant="outline" className="text-[#DC3545] hover:bg-[#FAE5E7] hover:text-[#68121A]" onClick={() => setDecision({ id: a.id, approve: false, reason: "" })}>
            <X /> Tolak
          </Button>
        </div>
      );
    const step = a.steps.find((s) => s.status === "pending");
    return (
      <span className="text-xs text-muted-foreground">
        {!hasApprove ? `Butuh ${meta.perm}` : `Menunggu ${step?.roles.filter((r) => r !== "admin").map((r) => ROLE_META[r].label).join(" / ")}`}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={meta.label}
        subtitle={meta.desc}
        action={
          <Badge variant={hasApprove ? "success" : "neutral"} className="font-mono">
            {hasApprove ? meta.perm : `view_any_${meta.resource} (lihat saja)`}
          </Badge>
        }
      />

      {type === "discount" && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
            <span className="mr-2 font-semibold">Tier LOA aktif:</span>
            {settings.loa.map((t, i) => {
              const prev = i === 0 ? 0 : settings.loa[i - 1].max ?? 0;
              return (
                <Badge key={t.role} variant={session?.role === t.role ? "default" : "info"}>
                  {t.label}: {t.max === null ? `> ${prev}%` : i === 0 ? `≤ ${t.max}%` : `${prev}–${t.max}%`}
                </Badge>
              );
            })}
            <span className="text-xs text-muted-foreground">
              (contoh, angka final ditetapkan UP · ubah di Pengaturan) · {settings.discountTierMode === "single" ? "langsung ke satu tier yang mencakup; atasan boleh memutuskan" : "berurutan melalui setiap tier"} · menolak diskon = pesanan ditolak
            </span>
          </CardContent>
        </Card>
      )}

      {!hasApprove && (
        <div className="flex items-center gap-2 rounded-md border border-[#FFDA6B] bg-[#FFF4D1] p-3 text-sm text-[#6B5000]">
          <ShieldAlert className="h-4 w-4" /> Role Anda hanya dapat melihat halaman ini. Tombol Setujui / Tolak hanya untuk pemegang permission <code className="font-mono">{meta.perm}</code>.
        </div>
      )}

      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-muted p-1">
        {(
          [
            ["pending", `Menunggu (${counts.pending})`],
            ["done", `Riwayat (${counts.done})`],
            ["all", "Semua"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-[30px] whitespace-nowrap rounded-sm px-3 text-sm font-medium", tab === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No.</TableHead>
              <TableHead>Permintaan</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead className="text-right">Nilai</TableHead>
              <TableHead>Alur approval</TableHead>
              <TableHead>Diajukan</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((a, i) => (
              <TableRow key={a.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <p className="font-medium">
                    {a.title} {lateSla(a) && <Badge variant="danger" title={`Pending lebih dari ${settings.slaHours} jam; penyetuju menerima pengingat (tanpa auto-approve)`}>Lewat SLA</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.no} · {a.outletName}
                  </p>
                </TableCell>
                <TableCell>
                  <p>{salesOf(a.salesId).name}</p>
                  <p className="text-xs text-muted-foreground">{branchOf(salesOf(a.salesId).branchId).name}</p>
                </TableCell>
                <TableCell className="text-right">
                  {rupiah(a.amount)}
                  {a.discountPct !== undefined && <p className="text-xs font-semibold text-[#BA4917]">Diskon {a.discountPct}%</p>}
                </TableCell>
                <TableCell className="max-w-[320px]">
                  <StepTimeline a={a} />
                </TableCell>
                <TableCell className="text-xs">{fmtDate(a.createdAt)}</TableCell>
                <TableCell>{actionCell(a)}</TableCell>
                <TableCell>
                  <button onClick={() => setOpenId(a.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Detail & audit trail">
                    <Eye className="h-4 w-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.length === 0 && <EmptyState title={tab === "pending" ? "Tidak ada permintaan menunggu" : "Tidak ada data"} desc="Permintaan dari Mile Field dan review pesanan muncul di sini sesuai cakupan data Anda." />}
      </Card>

      {/* detail + audit */}
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>Detail Approval</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold">{open.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {open.no} · {meta.label}
                    </p>
                  </div>
                  <ApprovalBadge s={open.status} />
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  {[
                    { label: "Outlet", value: open.outletName },
                    { label: "Sales", value: `${salesOf(open.salesId).name} · ${branchOf(salesOf(open.salesId).branchId).name}` },
                    { label: "Nilai", value: rupiah(open.amount) },
                    ...(open.discountPct !== undefined ? [{ label: "Diskon", value: `${open.discountPct}%` }] : []),
                    ...open.details,
                    ...(open.orderId ? [{ label: "Pesanan terkait", value: `${orders.find((o) => o.id === open.orderId)?.no ?? "—"} · ${orders.find((o) => o.id === open.orderId)?.status ?? ""}` }] : []),
                    ...(open.oppId ? [{ label: "Peluang terkait", value: `${opps.find((o) => o.id === open.oppId)?.name ?? "—"} · ${opps.find((o) => o.id === open.oppId)?.stage ?? ""}` }] : []),
                  ].map((d) => (
                    <div key={d.label} className="flex gap-2">
                      <span className="w-28 shrink-0 text-muted-foreground">{d.label}</span>
                      <span className="font-medium">{d.value}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Alur approval</p>
                  <StepTimeline a={open} />
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Audit trail</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Pengguna</TableHead>
                        <TableHead>Aksi</TableHead>
                        <TableHead>Permission</TableHead>
                        <TableHead>Alasan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {open.audit.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{fmtDate(e.at)}</TableCell>
                          <TableCell className="text-xs">
                            {e.by}
                            <span className="block text-muted-foreground">{e.role}</span>
                          </TableCell>
                          <TableCell className="text-xs">{e.action}</TableCell>
                          <TableCell className="font-mono text-[11px]">{e.permission ?? "—"}</TableCell>
                          <TableCell className="text-xs">{e.reason || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {canActOnStep(open) && (
                <DialogFooter>
                  <Button variant="outline" className="text-[#DC3545]" onClick={() => setDecision({ id: open.id, approve: false, reason: "" })}>
                    Tolak
                  </Button>
                  <Button onClick={() => setDecision({ id: open.id, approve: true, reason: "" })}>Setujui</Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* decision */}
      <Dialog open={!!decision} onOpenChange={(v) => !v && setDecision(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>{decision?.approve ? "Setujui Permintaan" : "Tolak Permintaan"}</DialogTitle>
          </DialogHeader>
          {decision && (
            <div className="space-y-2 p-4">
              <p className="text-sm">{approvals.find((a) => a.id === decision.id)?.title}</p>
              <Label>{decision.approve ? "Catatan (opsional)" : "Alasan penolakan (wajib)"}</Label>
              <Textarea value={decision.reason} onChange={(e) => setDecision({ ...decision, reason: e.target.value })} placeholder={decision.approve ? "mis. Margin masih aman" : "mis. Diskon melebihi program bulan ini"} />
              {needsCredit && (
                <div className="grid grid-cols-3 gap-4 rounded-md border border-[#9FE1FE] bg-[#E6F7FF] p-3">
                  <div className="space-y-1">
                    <Label>Limit kredit (Rp)</Label>
                    <Input type="number" value={decision.limit ?? ""} onChange={(e) => setDecision({ ...decision, limit: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label>TOP (hari)</Label>
                    <Input type="number" value={decision.top ?? ""} onChange={(e) => setDecision({ ...decision, top: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Price group</Label>
                    <Select value={decision.priceGroup ?? ""} onValueChange={(v) => setDecision({ ...decision, priceGroup: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_GROUPS.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="col-span-3 text-xs text-[#01496A]">Wajib diisi Finance sebelum menyetujui. Nilai ini dipakai saat pelanggan diaktifkan{settings.variant === "A" ? " dan dibuat di Odoo (res.partner)" : ""}.</p>
                </div>
              )}
              {!decision.approve && decA?.orderId && <p className="text-xs text-[#BF2130]">Menolak permintaan ini membuat pesanan terkait berstatus Ditolak.</p>}
              <p className="text-xs text-muted-foreground">Keputusan dicatat dengan pengguna, permission ({meta.perm}), waktu dan alasan.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Batal
            </Button>
            <Button
              variant={decision?.approve ? "default" : "destructive"}
              disabled={(!decision?.approve && !decision?.reason) || (needsCredit && (!decision?.limit || !decision?.top || !decision?.priceGroup))}
              onClick={() => {
                if (!decision) return;
                decideApproval(
                  decision.id,
                  decision.approve,
                  decision.reason,
                  needsCredit ? { nooCredit: { limit: decision.limit!, top: decision.top!, priceGroup: decision.priceGroup! } } : undefined
                );
                setDecision(null);
              }}
            >
              {decision?.approve ? "Setujui" : "Tolak"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
