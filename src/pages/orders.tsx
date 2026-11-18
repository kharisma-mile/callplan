import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, FileSpreadsheet, Inbox, Loader2, Pencil, Plus, RefreshCw, Send, ShieldQuestion, Smartphone, Trash2, XCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrderBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { PRODUCTS, productById } from "@/data/mock";
import type { ApprovalType, Order, OrderItem, OrderStatus } from "@/data/types";
import { checkOrder, listPrice, orderGross, orderTotal } from "@/lib/approval";
import { APPROVAL_META } from "@/lib/rbac";
import { fmtDate, nowStamp, rupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

// Module 07 §4.5: Varian B ends at Selesai / Dibatalkan (delivery is out of scope)
const B_FLOW: OrderStatus[] = ["Dikonfirmasi", "Diproses", "Selesai"];
type ItemEdit = { mode: "edit"; idx: number; qty: number; price: number; reason: string } | { mode: "add"; productId: string; uom: string; qty: number; reason: string } | { mode: "remove"; idx: number; reason: string };
let soSeq = 880;

export function OrdersPage() {
  const { orders, setOrders, outlets, inScope, can, settings, toast, user, approvals, submitOrderApprovals, simulateIncomingOrder, setOrderStatus } = useApp();
  const [filter, setFilter] = useState<"review" | "approval" | "done" | "all">("review");
  const [selId, setSelId] = useState<string | null>(null);
  const [itemEdit, setItemEdit] = useState<ItemEdit | null>(null);
  const [reject, setReject] = useState<string | null>(null);
  const [cancel, setCancel] = useState<string | null>(null);
  const autoMode = settings.approvalTrigger === "auto";
  const A = settings.variant === "A";

  const scoped = orders.filter((o) => inScope(o.salesId));
  const groups = {
    review: scoped.filter((o) => o.status === "Menunggu Review"),
    approval: scoped.filter((o) => o.status === "Menunggu Approval"),
    done: scoped.filter((o) => !["Menunggu Review", "Menunggu Approval"].includes(o.status)),
    all: scoped,
  };
  const list = groups[filter];
  const sortedReview = filter === "review" ? [...list].sort((a, b) => a.date.localeCompare(b.date)) : list;
  const sel = orders.find((o) => o.id === (selId ?? list[0]?.id)) ?? null;
  const outlet = sel ? outlets.find((o) => o.id === sel.outletId) : undefined;
  const checks = useMemo(() => (sel && outlet ? checkOrder(sel, outlet, settings) : []), [sel, outlet, settings]);
  const pendingLinked = sel ? approvals.filter((a) => a.orderId === sel.id && a.status === "pending") : [];
  const needs = (checks.filter((c) => c.needs).map((c) => c.needs!) as ApprovalType[]).filter((t) => !pendingLinked.some((a) => a.type === t));
  const canUpdate = can("update_order");
  const canConfirm = can("confirm_order");

  const patch = (id: string, fn: (o: Order) => Order) => setOrders((l) => l.map((o) => (o.id === id ? fn(o) : o)));
  const log = (o: Order, text: string): Order => ({ ...o, log: [...o.log, { at: nowStamp(), by: user!.name, text }] });

  const submitApprovals = () => {
    if (!sel) return;
    const made = submitOrderApprovals(sel.id);
    if (made.length) toast({ tone: "info", title: "Approval diajukan", desc: made.map((t) => APPROVAL_META[t].label).join(" · ") });
  };

  /** Module 07 FR-007: qty / price / add / remove with a required reason; above-limit changes go back to approval (auto). */
  const applyItemEdit = () => {
    if (!sel || !itemEdit || !outlet) return;
    let items: OrderItem[] = sel.items;
    let text = "";
    if (itemEdit.mode === "edit") {
      const it = sel.items[itemEdit.idx];
      items = sel.items.map((x, i) => (i === itemEdit.idx ? { ...x, qty: itemEdit.qty, price: itemEdit.price } : x));
      const parts = [];
      if (it.qty !== itemEdit.qty) parts.push(`qty ${it.qty} → ${itemEdit.qty}`);
      if (it.price !== itemEdit.price) parts.push(`harga ${rupiah(it.price)} → ${rupiah(itemEdit.price)}`);
      text = `${productById(it.productId).name}: ${parts.join(", ") || "tanpa perubahan"} (${itemEdit.reason})`;
    } else if (itemEdit.mode === "add") {
      const price = listPrice(itemEdit.productId, itemEdit.uom) ?? 0;
      items = [...sel.items, { productId: itemEdit.productId, uom: itemEdit.uom, qty: itemEdit.qty, price }];
      text = `Item ditambah: ${productById(itemEdit.productId).name} ${itemEdit.qty} ${itemEdit.uom} (${itemEdit.reason})`;
    } else {
      const it = sel.items[itemEdit.idx];
      items = sel.items.filter((_, i) => i !== itemEdit.idx);
      text = `Item dihapus: ${productById(it.productId).name} (${itemEdit.reason})`;
    }
    // a changed price invalidates an earlier special-order approval
    const priceChanged = itemEdit.mode === "edit" && sel.items[itemEdit.idx].price !== itemEdit.price;
    const next: Order = log({ ...sel, items, approvedTypes: priceChanged ? sel.approvedTypes.filter((t) => t !== "special_order") : sel.approvedTypes }, text);
    patch(sel.id, () => next);
    const needs = checkOrder(next, outlet, settings).filter((c) => c.needs);
    if (needs.length && autoMode) {
      const made = submitOrderApprovals(sel.id, next);
      toast({ tone: "warning", title: "Perubahan perlu approval ulang", desc: made.map((t) => APPROVAL_META[t].label).join(" · ") });
    } else toast({ tone: "success", title: "Pesanan diubah", desc: needs.length ? "Perubahan melewati batas: ajukan approval" : "Perubahan tercatat di log pesanan" });
    setItemEdit(null);
  };

  const pushToOdoo = (id: string, retry = false) => {
    patch(id, (o) => log({ ...o, status: "Mengirim ke Odoo" }, retry ? "Kirim ulang ke Odoo (idempotent, client_order_ref = nomor pesanan)" : "Dikonfirmasi Sales Admin, dikirim ke Odoo"));
    setTimeout(() => {
      setOrders((l) =>
        l.map((o) => {
          if (o.id !== id) return o;
          const so = o.soNumber ?? `SO/UP/2611/${String(++soSeq).padStart(5, "0")}`;
          return { ...o, status: "SO Draft di Odoo", soNumber: so, log: [...o.log, { at: nowStamp(), by: "Odoo adapter", text: `sale.order dibuat (draft) · ${so}` }] };
        })
      );
      toast({ tone: "success", title: "Sales order dibuat di Odoo", desc: "SO draft · status dan nomor SO dikirim kembali ke Mile Field" });
    }, 1800);
  };

  const confirm = () => {
    if (!sel) return;
    if (A) pushToOdoo(sel.id);
    else {
      setOrderStatus(sel.id, "Dikonfirmasi", `Dikonfirmasi di modul · ${sel.no}`);
      toast({ tone: "success", title: "Pesanan dikonfirmasi", desc: `${sel.no} · status dikelola di Modul Sales Operations` });
    }
  };

  /** Variant A: scheduled read-back of the SO state from Odoo (15–30 min). */
  const readBack = () => {
    if (!sel) return;
    patch(sel.id, (o) => ({ ...o, status: "Dikonfirmasi di Odoo", log: [...o.log, { at: nowStamp(), by: "Odoo adapter", text: `Read-back: ${o.soNumber} berstatus sale (dikonfirmasi di Odoo)` }] }));
    toast({ tone: "success", title: "Status dibaca dari Odoo", desc: `${sel.soNumber} · Dikonfirmasi di Odoo` });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Pesanan"
        subtitle={
          A
            ? "Varian A: pesanan dari Mile Field dicek ulang (harga, UoM, kredit), dikonfirmasi Sales Admin, lalu dibuat sebagai Sales Order draft di Odoo."
            : "Varian B: pesanan dari Mile Field dicek terhadap price list dan piutang di modul; status pesanan dikelola langsung di modul."
        }
        action={
          <>
            <Button variant="outline" onClick={simulateIncomingOrder} title="Simulasi webhook pesanan dari Mile Field">
              <Inbox /> Simulasi pesanan masuk
            </Button>
            {can("export_data") && (
              <Button variant="outline" onClick={() => toast({ tone: "success", title: "Export pesanan dibuat", desc: `pesanan-${scoped.length}-baris.xlsx · sesuai filter dan cakupan` })}>
                <FileSpreadsheet /> Export Excel
              </Button>
            )}
          </>
        }
      />

      <p className="text-xs text-muted-foreground">
        Pemicu approval: <b>{autoMode ? "otomatis saat pesanan masuk" : "oleh Sales Admin (tombol Ajukan approval)"}</b> · ubah di Pengaturan.
      </p>
      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-muted p-1">
        {(
          [
            ["review", "Menunggu Review"],
            ["approval", "Menunggu Approval"],
            ["done", "Diproses"],
            ["all", "Semua"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => {
              setFilter(k);
              setSelId(null);
            }}
            className={cn("h-[30px] whitespace-nowrap rounded-sm px-3 text-sm font-medium", filter === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}
          >
            {l} ({groups[k].length})
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-2">
          {list.length === 0 && (
            <Card>
              <EmptyState title="Tidak ada pesanan" desc="Pesanan dari Mile Field muncul di sini (webhook)." />
            </Card>
          )}
          {sortedReview.map((o) => {
            const ot = outlets.find((x) => x.id === o.outletId);
            return (
              <button
                key={o.id}
                onClick={() => setSelId(o.id)}
                className={cn("w-full rounded-md border bg-background p-3 text-left shadow-sm transition-colors", sel?.id === o.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-[#9FE1FE]")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{ot?.name}</span>
                  <OrderBadge s={o.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {o.no} · {salesOf(o.salesId).name} · {fmtDate(o.date)}
                </p>
                {o.status === "Menunggu Review" && ot && checkOrder(o, ot, settings).some((c) => !c.ok) && <p className="text-[11px] font-semibold text-[#BF2130]">Ada selisih harga / kredit</p>}
                <p className="mt-1 text-sm font-semibold">{rupiah(orderTotal(o))}</p>
              </button>
            );
          })}
        </div>

        {sel && outlet && (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 border-b border-border">
              <div>
                <CardTitle className="text-lg">{outlet.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {sel.no} · {salesOf(sel.salesId).name} · {branchOf(outlet.branchId).name} · {fmtDate(sel.date)}
                </p>
                <p className="text-[11px] text-muted-foreground">Ref. Mile Field: {sel.mfRef}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Smartphone className="h-3.5 w-3.5" /> Dibuat di Mile Field saat kunjungan
                  {sel.note && <> · Catatan: "{sel.note}"</>}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <OrderBadge s={sel.status} />
                {sel.soNumber && <span className="font-mono text-xs">{sel.soNumber}</span>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              {/* checks */}
              <div className="grid gap-2 md:grid-cols-2">
                {checks.map((c) => (
                  <div key={c.key} className={cn("flex items-start gap-2 rounded-md border p-2", c.ok ? "border-[#ADF0D1] bg-[#D8F8E9]/50" : "border-[#F3B9BF] bg-[#FAE5E7]/60")}>
                    {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#198754]" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#DC3545]" />}
                    <div>
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* items */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">No.</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead>UoM</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Harga</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sel.items.map((it, i) => {
                    const p = productById(it.productId);
                    const lp = listPrice(it.productId, it.uom);
                    return (
                      <TableRow key={i}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.sku}</p>
                        </TableCell>
                        <TableCell>
                          {it.uom}
                          <span className="block text-[11px] text-muted-foreground">
                            1 {it.uom} = {p.uoms.find((u) => u.uom === it.uom)?.conv} {p.uoms[0].uom}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{it.qty}</TableCell>
                        <TableCell className="text-right">
                          {rupiah(it.price)}
                          {lp !== it.price && <span className="block text-[11px] font-semibold text-[#BF2130]">list {rupiah(lp ?? 0)}</span>}
                        </TableCell>
                        <TableCell className="text-right">{rupiah(it.qty * it.price)}</TableCell>
                        <TableCell>
                          {canUpdate && sel.status === "Menunggu Review" && (
                            <div className="flex">
                              <button onClick={() => setItemEdit({ mode: "edit", idx: i, qty: it.qty, price: it.price, reason: "" })} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Ubah qty / harga">
                                <Pencil className="h-4 w-4" />
                              </button>
                              {sel.items.length > 1 && (
                                <button onClick={() => setItemEdit({ mode: "remove", idx: i, reason: "" })} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-[#FAE5E7] hover:text-[#68121A]" title="Hapus item">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {canUpdate && sel.status === "Menunggu Review" && (
                <Button size="sm" variant="outline" onClick={() => setItemEdit({ mode: "add", productId: PRODUCTS[0].id, uom: PRODUCTS[0].uoms[0].uom, qty: 1, reason: "" })}>
                  <Plus /> Tambah item
                </Button>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
                  <p className="mb-1 font-semibold">Kredit pelanggan</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">Limit kredit</span><span>{rupiah(outlet.creditLimit)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Saldo piutang</span><span>{rupiah(outlet.outstanding)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Jatuh tempo</span><span className={outlet.overdueDays > settings.overdueDays ? "font-semibold text-[#BF2130]" : ""}>{outlet.overdue ? `${rupiah(outlet.overdue)} · ${outlet.overdueDays} hr` : "—"}</span></div>
                  <div className="flex justify-between border-t border-border pt-1"><span className="text-muted-foreground">Setelah pesanan</span><span className="font-semibold">{rupiah(outlet.outstanding + orderTotal(sel))}</span></div>
                  <p className="pt-1 text-[11px] text-muted-foreground">{A ? "Sumber: Odoo (sinkron per jam + cek ulang saat kirim SO) · per 17 Nov 2026 10:00" : "Sumber: piutang di modul (diperbarui Finance via import Excel) · per 16 Nov 2026 17:02"}</p>
                </div>
                <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
                  <p className="mb-1 font-semibold">Ringkasan</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{rupiah(orderGross(sel))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Diskon</span><span>{sel.discountPct}% (−{rupiah(orderGross(sel) - orderTotal(sel))})</span></div>
                  <div className="flex justify-between border-t border-border pt-1 text-base"><span className="font-semibold">Total</span><span className="font-bold">{rupiah(orderTotal(sel))}</span></div>
                </div>
              </div>

              {/* Variant A sync timeline */}
              {A && ["Mengirim ke Odoo", "SO Draft di Odoo", "Dikonfirmasi di Odoo"].includes(sel.status) && (
                <div className="rounded-md border border-[#9FE1FE] bg-[#E6F7FF] p-3 text-sm">
                  <p className="mb-2 font-semibold text-[#01496A]">Status sinkron Odoo</p>
                  {[
                    ["Validasi ulang harga / UoM / kredit terhadap Odoo", true],
                    ["sale.order dibuat (draft / quotation)", sel.status !== "Mengirim ke Odoo"],
                    ["Nomor SO dikirim kembali ke Mile Field", sel.status !== "Mengirim ke Odoo"],
                    ...(sel.status === "Dikonfirmasi di Odoo" ? [["Read-back: SO dikonfirmasi di Odoo (state sale)", true]] : []),
                  ].map(([t, done], i) => (
                    <p key={i} className="flex items-center gap-2 text-xs">
                      {done ? <CheckCircle2 className="h-4 w-4 text-[#198754]" /> : <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                      {t as string}
                    </p>
                  ))}
                </div>
              )}

              {pendingLinked.length > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-[#EF9F7B] bg-[#FCEEE8] p-3 text-sm text-[#8D3711]">
                  <ShieldQuestion className="h-4 w-4" /> Menunggu: {pendingLinked.map((a) => `${APPROVAL_META[a.type].label} (${a.no})`).join(", ")}
                </div>
              )}

              {/* actions */}
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {sel.status === "Menunggu Review" && canConfirm && (
                  <>
                    {needs.length > 0 ? (
                      <Button onClick={submitApprovals}>
                        <ShieldQuestion /> {autoMode ? "Ajukan ulang approval" : "Ajukan approval"} ({needs.length})
                      </Button>
                    ) : pendingLinked.length > 0 || checks.some((c) => !c.ok) ? null : (
                      <Button onClick={confirm}>
                        {A ? <Send /> : <CheckCircle2 />} {A ? "Konfirmasi & Kirim ke Odoo" : "Konfirmasi Pesanan"}
                      </Button>
                    )}
                    <Button variant="outline" className="text-[#DC3545]" onClick={() => setReject(sel.id)}>
                      <XCircle /> Tolak
                    </Button>
                  </>
                )}
                {!A && B_FLOW.slice(0, 2).includes(sel.status) && canConfirm && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const next = B_FLOW[B_FLOW.indexOf(sel.status) + 1];
                        setOrderStatus(sel.id, next, `Status diubah ke ${next}`);
                        toast({ tone: "success", title: `Status: ${next}`, desc: sel.no });
                      }}
                    >
                      <ArrowRight /> Ubah status ke {B_FLOW[B_FLOW.indexOf(sel.status) + 1]}
                    </Button>
                    <Button variant="outline" className="text-[#DC3545]" onClick={() => setCancel(sel.id)}>
                      <Ban /> Batalkan
                    </Button>
                  </>
                )}
                {A && sel.status === "Gagal Sinkron" && canConfirm && (
                  <Button onClick={() => pushToOdoo(sel.id, true)}>
                    <RefreshCw /> Kirim ulang
                  </Button>
                )}
                {A && sel.status === "SO Draft di Odoo" && (
                  <Button variant="outline" onClick={readBack} title="Simulasi job read-back status SO (15–30 menit)">
                    <RefreshCw /> Baca status dari Odoo
                  </Button>
                )}
                {!canConfirm && <span className="text-xs text-muted-foreground">Butuh permission confirm_order untuk memproses pesanan.</span>}
                <Badge variant="outline" className="ml-auto">
                  Varian {settings.variant}
                </Badge>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Log pesanan</p>
                <div className="space-y-2 border-l-2 border-[#E8E8E8] pl-3">
                  {[...sel.log].reverse().map((l, i) => (
                    <div key={i} className="text-xs">
                      <p className="font-medium">{l.text}</p>
                      <p className="text-muted-foreground">
                        {fmtDate(l.at)} · {l.by}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!itemEdit} onOpenChange={(v) => !v && setItemEdit(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>{itemEdit?.mode === "add" ? "Tambah Item" : itemEdit?.mode === "remove" ? "Hapus Item" : "Ubah Item"}</DialogTitle>
          </DialogHeader>
          {itemEdit && sel && (
            <div className="space-y-4 p-4">
              {itemEdit.mode !== "add" && (
                <p className="text-sm">
                  {productById(sel.items[itemEdit.idx].productId).name} · {sel.items[itemEdit.idx].uom} · list {rupiah(listPrice(sel.items[itemEdit.idx].productId, sel.items[itemEdit.idx].uom) ?? 0)}
                </p>
              )}
              {itemEdit.mode === "edit" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Qty baru</Label>
                    <Input type="number" min={0} value={itemEdit.qty} onChange={(e) => setItemEdit({ ...itemEdit, qty: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Harga (Rp)</Label>
                    <Input type="number" min={0} value={itemEdit.price} onChange={(e) => setItemEdit({ ...itemEdit, price: Number(e.target.value) })} />
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground">Harga di luar price list memicu Approval Pesanan Khusus ulang (AS-20).</p>
                </div>
              )}
              {itemEdit.mode === "add" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <Label>Produk</Label>
                    <Select value={itemEdit.productId} onValueChange={(v) => setItemEdit({ ...itemEdit, productId: v, uom: productById(v).uoms[0].uom })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCTS.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.sku} · {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>UoM (harga price list)</Label>
                    <Select value={itemEdit.uom} onValueChange={(v) => setItemEdit({ ...itemEdit, uom: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {productById(itemEdit.productId).uoms.map((u) => (
                          <SelectItem key={u.uom} value={u.uom}>
                            {u.uom} · {rupiah(u.price)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Qty</Label>
                    <Input type="number" min={1} value={itemEdit.qty} onChange={(e) => setItemEdit({ ...itemEdit, qty: Number(e.target.value) })} />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label>Alasan perubahan (wajib, tercatat di log)</Label>
                <Textarea value={itemEdit.reason} onChange={(e) => setItemEdit({ ...itemEdit, reason: e.target.value })} placeholder="mis. Stok gudang cabang terbatas, konfirmasi via telepon dengan pemilik" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemEdit(null)}>
              Batal
            </Button>
            <Button variant={itemEdit?.mode === "remove" ? "destructive" : "default"} disabled={!itemEdit?.reason} onClick={applyItemEdit}>
              {itemEdit?.mode === "remove" ? "Hapus" : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RejectDialog
        open={!!cancel}
        title="Batalkan Pesanan"
        action="Batalkan"
        onClose={() => setCancel(null)}
        onSubmit={(reason) => {
          if (!cancel) return;
          setOrderStatus(cancel, "Dibatalkan", `Dibatalkan: ${reason}`);
          toast({ tone: "danger", title: "Pesanan dibatalkan", desc: "Alasan dikirim ke sales di Mile Field" });
          setCancel(null);
        }}
      />

      <RejectDialog
        open={!!reject}
        onClose={() => setReject(null)}
        onSubmit={(reason) => {
          if (!reject) return;
          patch(reject, (o) => log({ ...o, status: "Ditolak" }, `Ditolak: ${reason}`));
          toast({ tone: "danger", title: "Pesanan ditolak", desc: "Alasan dikirim ke sales di Mile Field" });
          setReject(null);
        }}
      />
    </div>
  );
}

function RejectDialog({ open, onClose, onSubmit, title = "Tolak Pesanan", action = "Tolak" }: { open: boolean; onClose: () => void; onSubmit: (r: string) => void; title?: string; action?: string }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="gap-0 p-0">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 p-4">
          <Label>Alasan penolakan</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="destructive"
            disabled={!reason}
            onClick={() => {
              onSubmit(reason);
              setReason("");
            }}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
