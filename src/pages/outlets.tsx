import { useMemo, useState } from "react";
import { Download, Eye, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClassBadge, CustomerBadge, OrderBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { BRANCHES, CUSTOMER_STATUS_LABEL, SALESMEN, nextOutletSeq } from "@/data/mock";
import type { CustomerStatus, Outlet, OutletClass } from "@/data/types";
import { fmtDate, pct, rupiah, rupiahShort } from "@/lib/format";
import { orderTotal } from "@/lib/approval";
import { ROLE_META } from "@/lib/rbac";

const blank = (salesId: string): Outlet => {
  const s = salesOf(salesId);
  return {
    id: "",
    code: "",
    name: "",
    owner: "",
    phone: "",
    address: "",
    city: branchOf(s.branchId).city,
    branchId: s.branchId,
    salesId,
    status: "baru",
    cls: "C",
    segment: "Toko Kemasan",
    creditLimit: 0,
    outstanding: 0,
    overdue: 0,
    overdueDays: 0,
    top: 0,
  };
};

export function OutletsPage() {
  const { outlets, setOutlets, setPjp, inScope, scopeSalesIds, can, toast, user, orders, settings } = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | CustomerStatus>("all");
  const [cls, setCls] = useState<"all" | OutletClass>("all");
  const [branch, setBranch] = useState("all");
  const [detail, setDetail] = useState<Outlet | null>(null);
  const [edit, setEdit] = useState<Outlet | null>(null);
  const [del, setDel] = useState<Outlet | null>(null);
  const showBranch = ROLE_META[user!.role].scope === "all";

  const rows = useMemo(
    () =>
      outlets.filter(
        (o) =>
          inScope(o.salesId) &&
          (status === "all" || o.status === status) &&
          (cls === "all" || o.cls === cls) &&
          (branch === "all" || o.branchId === branch) &&
          (q === "" || `${o.name} ${o.code} ${o.owner}`.toLowerCase().includes(q.toLowerCase()))
      ),
    [outlets, inScope, status, cls, branch, q]
  );
  const shown = rows.slice(0, 100);
  const totalOut = rows.reduce((a, o) => a + o.outstanding, 0);
  const totalOverdue = rows.reduce((a, o) => a + (o.overdueDays > settings.overdueDays ? o.overdue : 0), 0);

  const save = () => {
    if (!edit) return;
    if (!edit.id) {
      const seq = nextOutletSeq();
      const o = { ...edit, id: `O${seq}`, code: `C-${edit.branchId}-${String(seq).padStart(4, "0")}`, branchId: salesOf(edit.salesId).branchId };
      setOutlets((l) => [o, ...l]);
      toast({ tone: "success", title: "Outlet dibuat", desc: o.name });
    } else {
      setOutlets((l) => l.map((x) => (x.id === edit.id ? edit : x)));
      toast({ tone: "success", title: "Outlet diperbarui", desc: edit.name });
    }
    setEdit(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outlet / Pelanggan"
        subtitle="Master outlet dengan status pembelian, kelas, limit kredit dan ringkasan piutang."
        action={
          <>
            {can("import_outlet") && (
              <Button variant="outline" onClick={() => toast({ tone: "info", title: "Import outlet", desc: settings.variant === "A" ? "Di Varian A master pelanggan disinkronkan dari Odoo; import hanya untuk data tambahan (kelas, sales)." : "Buka menu Import / Export Excel untuk import massal." })}>
                <Upload /> Import
              </Button>
            )}
            {can("export_outlet") && (
              <Button variant="outline" onClick={() => toast({ tone: "success", title: "Export Excel dibuat", desc: `outlet-${new Date().getTime().toString().slice(-5)}.xlsx · ${rows.length} baris` })}>
                <Download /> Export
              </Button>
            )}
            {can("create_outlet") && (
              <Button onClick={() => setEdit(blank(scopeSalesIds[0]))}>
                <Plus /> Buat Outlet
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(CUSTOMER_STATUS_LABEL) as CustomerStatus[]).map((s) => (
          <Card key={s} className="cursor-pointer" onClick={() => setStatus(status === s ? "all" : s)}>
            <CardContent className={`flex items-center justify-between p-4 ${status === s ? "rounded-lg ring-2 ring-primary" : ""}`}>
              <CustomerBadge s={s} />
              <span className="text-xl font-bold">{outlets.filter((o) => inScope(o.salesId) && o.status === s).length}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="relative w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Cari nama, kode, pemilik..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {(Object.keys(CUSTOMER_STATUS_LABEL) as CustomerStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {CUSTOMER_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cls} onValueChange={(v) => setCls(v as typeof cls)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua kelas</SelectItem>
              <SelectItem value="A">Kelas A</SelectItem>
              <SelectItem value="B">Kelas B</SelectItem>
              <SelectItem value="C">Kelas C</SelectItem>
            </SelectContent>
          </Select>
          {showBranch && (
            <Select value={branch} onValueChange={setBranch}>
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
          <div className="ml-auto flex gap-2 text-xs">
            <Badge variant="neutral">{rows.length} outlet</Badge>
            <Badge variant="info">Piutang {rupiahShort(totalOut)}</Badge>
            <Badge variant="danger">
              Jatuh tempo &gt; {settings.overdueDays} hr {rupiahShort(totalOverdue)}
            </Badge>
          </div>
        </CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No.</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead>Kelas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Limit kredit</TableHead>
              <TableHead className="text-right">Piutang</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((o, i) => (
              <TableRow key={o.id} className="cursor-pointer" onClick={() => setDetail(o)}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>
                  <p className="font-medium">{o.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.code} · {o.segment} · {o.city}
                  </p>
                </TableCell>
                <TableCell>
                  <p>{salesOf(o.salesId).name}</p>
                  <p className="text-xs text-muted-foreground">{branchOf(o.branchId).name}</p>
                </TableCell>
                <TableCell>
                  <ClassBadge c={o.cls} />
                </TableCell>
                <TableCell>
                  <CustomerBadge s={o.status} />
                </TableCell>
                <TableCell className="text-right">{o.creditLimit ? rupiah(o.creditLimit) : "—"}</TableCell>
                <TableCell className="text-right">
                  <p>{o.outstanding ? rupiah(o.outstanding) : "—"}</p>
                  {o.overdueDays > 0 && (
                    <p className={`text-xs ${o.overdueDays > settings.overdueDays ? "font-semibold text-[#BF2130]" : "text-[#9E7700]"}`}>
                      {rupiahShort(o.overdue)} lewat {o.overdueDays} hr
                    </p>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetail(o)}>
                        <Eye /> Lihat detail
                      </DropdownMenuItem>
                      {can("update_outlet") && (
                        <DropdownMenuItem onClick={() => setEdit(o)}>
                          <Pencil /> Ubah
                        </DropdownMenuItem>
                      )}
                      {can("delete_outlet") && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDel(o)} className="text-destructive focus:text-destructive">
                            <Trash2 /> Hapus
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && <EmptyState title="Data tidak ditemukan" desc="Ubah filter atau kata kunci pencarian." />}
        {rows.length > 100 && <p className="p-4 text-center text-xs text-muted-foreground">Menampilkan 100 dari {rows.length} outlet</p>}
      </Card>

      {/* detail */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>Detail Outlet</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold">{detail.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {detail.code} {detail.odooRef && `· Odoo ${detail.odooRef}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClassBadge c={detail.cls} />
                    <CustomerBadge s={detail.status} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  {[
                    ["Pemilik", detail.owner],
                    ["Telepon", detail.phone],
                    ["Alamat", `${detail.address}, ${detail.city}`],
                    ["Segmen", detail.segment],
                    ["Sales", salesOf(detail.salesId).name],
                    ["Cabang", branchOf(detail.branchId).name],
                    ["TOP", detail.top ? `${detail.top} hari` : "—"],
                    ["Order terakhir", detail.lastOrder ? fmtDate(detail.lastOrder) : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="w-28 shrink-0 text-muted-foreground">{k}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Ringkasan piutang</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      ["Limit kredit", rupiah(detail.creditLimit)],
                      ["Saldo piutang", rupiah(detail.outstanding)],
                      ["Sisa limit", rupiah(Math.max(0, detail.creditLimit - detail.outstanding))],
                      ["Jatuh tempo", detail.overdue ? `${rupiah(detail.overdue)} (${detail.overdueDays} hr)` : "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-md bg-muted p-3">
                        <p className="text-xs text-muted-foreground">{k}</p>
                        <p className="text-sm font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>
                  {detail.creditLimit > 0 && (
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#E8E8E8]">
                      <div className={`h-full ${pct(detail.outstanding, detail.creditLimit) > 90 ? "bg-[#DC3545]" : "bg-primary"}`} style={{ width: `${Math.min(100, pct(detail.outstanding, detail.creditLimit))}%` }} />
                    </div>
                  )}
                  {detail.overdueDays > settings.overdueDays && (
                    <p className="mt-2 rounded-md bg-[#FAE5E7] p-2 text-xs text-[#68121A]">
                      Piutang jatuh tempo &gt; {settings.overdueDays} hari: pesanan baru wajib melalui Approval Kelonggaran Limit Kredit.
                    </p>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Pesanan terbaru</p>
                  {orders.filter((o) => o.outletId === detail.id).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Belum ada pesanan dari Mile Field.</p>
                  ) : (
                    orders
                      .filter((o) => o.outletId === detail.id)
                      .map((o) => (
                        <div key={o.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                          <span>
                            {o.no} · {fmtDate(o.date)}
                          </span>
                          <span className="flex items-center gap-2">
                            {rupiah(orderTotal(o))} <OrderBadge s={o.status} />
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* create / edit */}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="gap-0 p-0">
          {edit && (
            <>
              <DialogHeader>
                <DialogTitle>{edit.id ? "Ubah Outlet" : "Buat Outlet"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 p-4">
                <div className="col-span-2 space-y-1">
                  <Label>Nama outlet</Label>
                  <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Toko Plastik ..." />
                </div>
                <div className="space-y-1">
                  <Label>Pemilik</Label>
                  <Input value={edit.owner} onChange={(e) => setEdit({ ...edit, owner: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Telepon</Label>
                  <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Alamat</Label>
                  <Input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Sales</Label>
                  <Select value={edit.salesId} onValueChange={(v) => setEdit({ ...edit, salesId: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SALESMEN.filter((s) => scopeSalesIds.includes(s.id)).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} · {branchOf(s.branchId).name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Kelas</Label>
                  <Select value={edit.cls} onValueChange={(v) => setEdit({ ...edit, cls: v as OutletClass })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A (F4)</SelectItem>
                      <SelectItem value="B">B (F2)</SelectItem>
                      <SelectItem value="C">C (F1)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v as CustomerStatus })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CUSTOMER_STATUS_LABEL) as CustomerStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {CUSTOMER_STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Limit kredit (Rp)</Label>
                  <Input type="number" value={edit.creditLimit} onChange={(e) => setEdit({ ...edit, creditLimit: Number(e.target.value) })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEdit(null)}>
                  Batal
                </Button>
                <Button onClick={save} disabled={!edit.name}>
                  Simpan
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* delete */}
      <Dialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Hapus Outlet</DialogTitle>
          </DialogHeader>
          <p className="p-4 text-sm">
            Hapus <b>{del?.name}</b> dari master outlet? Outlet juga dihapus dari PJP.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setOutlets((l) => l.filter((x) => x.id !== del!.id));
                setPjp((l) => l.filter((x) => x.outletId !== del!.id));
                toast({ tone: "danger", title: "Outlet dihapus", desc: del!.name });
                setDel(null);
              }}
            >
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
