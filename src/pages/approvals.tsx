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
import { APPROVAL_META, REQUEST_PAGES, rolesHolding, type RequestPage } from "@/lib/rbac";
import { approvalPerms, loaBand, stepApproverText, stepPerms, stepTitle } from "@/lib/approval";
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
              <span className="font-medium" title={stepApproverText(s)}>
                {stepTitle(a.steps, i)}
              </span>
              <span className="font-mono text-[10px] opacity-80">({s.permission})</span>
              {s.by && <span>· {s.by}</span>}
            </div>
            {i < a.steps.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        );
      })}
    </div>
  );
}

/** D-52 Request pages: LOA (discount + special order + credit override, filter by type), New Customer (NOO), Pipeline. */
export function ApprovalPage({ page }: { page: RequestPage }) {
  const { approvals, inScope, can, canActOnStep, decideApproval, settings, orders, opps, permissions, roles } = useApp();
  const def = REQUEST_PAGES[page];
  const [typeFilter, setTypeFilter] = useState<ApprovalType | "all">("all");
  const types = useMemo(() => (typeFilter === "all" ? def.types : [typeFilter]), [typeFilter, def]);
  const [tab, setTab] = useState<"pending" | "done" | "all">("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ id: string; approve: boolean; reason: string; limit?: number; top?: number; priceGroup?: string } | null>(null);
  const decA = decision ? approvals.find((a) => a.id === decision.id) : undefined;
  const decStep = decA?.steps.find((s) => s.status === "pending");
  /** NOO credit step (approve_noo_credit, else the last step) must set credit limit, TOP and price group before approving (module 06 FR-010). */
  const needsCredit = !!decision?.approve && decA?.type === "noo" && !!decStep?.setsCredit;
  const lateSla = (a: ApprovalRequest) => a.status === "pending" && hoursSince(a.createdAt) > settings.slaHours;
  const perms = Array.from(new Set(types.flatMap((t) => approvalPerms(t, settings))));
  const hasApprove = perms.some(can);
  const visible = useMemo(() => approvals.filter((a) => types.includes(a.type) && inScope(a.salesId)), [approvals, types, inScope]);

  const list = useMemo(
    () =>
      visible
        .filter((a) => (tab === "pending" ? a.status === "pending" : tab === "done" ? a.status !== "pending" : true))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [visible, tab]
  );
  const counts = {
    pending: visible.filter((a) => a.status === "pending").length,
    done: visible.filter((a) => a.status !== "pending").length,
  };
  const pendingOf = (t: ApprovalType) => approvals.filter((a) => a.type === t && inScope(a.salesId) && a.status === "pending").length;
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
    if (!step) return null;
    const holders = rolesHolding(step.permission, permissions, roles);
    return (
      <span className="text-xs text-muted-foreground" title={stepApproverText(step)}>
        Menunggu pemegang <code className="font-mono">{step.permission}</code>
        {holders.length > 0 && <span className="block">contoh role: {holders.join(", ")}</span>}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={def.title}
        subtitle={def.desc}
        action={
          <Badge variant={hasApprove ? "success" : "neutral"} className="font-mono">
            {hasApprove ? perms.filter(can).join(" · ") : "lihat saja"}
          </Badge>
        }
      />

      {def.types.length > 1 && (
        <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-md border border-border bg-background p-1">
          {(["all", ...def.types] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn("h-[30px] whitespace-nowrap rounded-sm px-3 text-sm font-medium", typeFilter === t ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              {t === "all" ? "Semua" : APPROVAL_META[t].short}
              {t !== "all" && pendingOf(t) > 0 && <span className="ml-1.5 text-xs text-muted-foreground">({pendingOf(t)})</span>}
            </button>
          ))}
        </div>
      )}

      {types.includes("discount") && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
            <span className="mr-2 font-semibold">Tier LOA aktif:</span>
            {settings.loa.map((t, i) => (
              <Badge key={t.label + i} variant={t.permission && can(t.permission) ? "default" : "info"} title={t.permission ? `Penyetuju: pemegang permission ${t.permission}` : "Sales boleh memberi tanpa approval"}>
                {t.label} {loaBand(settings.loa, i)}
                {t.permission ? <span className="ml-1 font-mono text-[10px]">({t.permission})</span> : ""}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground">
              (contoh, angka final ditetapkan UP · ubah di Pengaturan) · {settings.discountTierMode === "single" ? "langsung ke satu tier yang mencakup; pemegang permission tier di atasnya juga boleh memutuskan" : "berurutan melalui setiap tier"} · menolak diskon = pesanan ditolak
            </span>
          </CardContent>
        </Card>
      )}

      {!hasApprove && (
        <div className="flex items-center gap-2 rounded-md border border-[#FFDA6B] bg-[#FFF4D1] p-3 text-sm text-[#6B5000]">
          <ShieldAlert className="h-4 w-4" /> Role Anda hanya dapat melihat halaman ini. Tombol Setujui / Tolak hanya untuk pemegang permission <code className="font-mono">{perms.join(" / ")}</code>.
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
                    {def.types.length > 1 && <span className="font-medium text-foreground">{APPROVAL_META[a.type].short} · </span>}
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
                <DialogTitle>Detail Request</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold">{open.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {open.no} · {APPROVAL_META[open.type].label}
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
                  <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {open.steps.map((s, i) => (
                      <li key={i}>
                        {stepTitle(open.steps, i)} — {stepApproverText(s)}
                        {rolesHolding(s.permission, permissions, roles).length > 0 && ` · dipegang role: ${rolesHolding(s.permission, permissions, roles).join(", ")}`}
                      </li>
                    ))}
                  </ul>
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
                  <p className="col-span-3 text-xs text-[#01496A]">Wajib diisi pada langkah kredit ({decStep?.permission}) sebelum menyetujui. Nilai ini dipakai saat pelanggan diaktifkan{settings.variant === "A" ? " dan dibuat di Odoo (res.partner)" : ""}.</p>
                </div>
              )}
              {!decision.approve && decA?.orderId && <p className="text-xs text-[#BF2130]">Menolak permintaan ini membuat pesanan terkait berstatus Ditolak.</p>}
              <p className="text-xs text-muted-foreground">Keputusan dicatat dengan pengguna, permission ({decStep ? stepPerms(decStep).find(can) ?? decStep.permission : ""}), waktu dan alasan.</p>
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
