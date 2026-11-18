import { useMemo, useState } from "react";
import { AlertTriangle, Info, Plus, Search, Smartphone, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox, Switch } from "@/components/switch";
import { EmptyState } from "@/components/empty-state";
import { useApp } from "@/store/app-store";
import { SEGMENT_LIST } from "@/data/mock";
import { nowStamp, rupiah } from "@/lib/format";
import type { AssortmentItem, Outlet, OutletClass } from "@/data/types";
import { cn } from "@/lib/utils";

const CLASSES: OutletClass[] = ["A", "B", "C"];

/**
 * Module 02 — Assortment Produk: products offered per segment (channel) x outlet class, with must-sell flags and
 * per-outlet exceptions. Feeds the Mile Field order catalog (bill items) of each outlet's visit task.
 */
export function AssortmentPage() {
  const { assortments, settings } = useApp();
  const [edit, setEdit] = useState<{ segment: string; cls: OutletClass } | null>(null);
  const missing = SEGMENT_LIST.length * CLASSES.length - assortments.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assortment Produk"
        subtitle="Produk yang ditawarkan per segmen (channel) dan kelas outlet. Menentukan katalog pesanan di Mile Field; produk Wajib (must-sell) otomatis tampil di setiap pesanan."
      />
      <Card>
        <CardContent className="flex flex-wrap items-start gap-2 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 text-primary" />
          <div className="flex-1 text-muted-foreground">
            Katalog outlet = assortment segmen × kelasnya, ditambah / dikurangi pengecualian per outlet. Harga tetap dari price list outlet.
            {missing > 0 && <> Kombinasi tanpa assortment ({missing}) memakai aturan cadangan: <b>{settings.assortmentFallback === "all" ? "semua produk aktif ditawarkan" : "tidak ada produk"}</b> (ubah di Pengaturan).</>}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">Segmen × Kelas</TabsTrigger>
          <TabsTrigger value="outlet">Per Outlet</TabsTrigger>
        </TabsList>
        <TabsContent value="matrix" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segmen / channel</TableHead>
                  {CLASSES.map((c) => <TableHead key={c}>Kelas {c}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {SEGMENT_LIST.map((seg) => (
                  <TableRow key={seg}>
                    <TableCell className="font-medium">{seg}</TableCell>
                    {CLASSES.map((cls) => {
                      const a = assortments.find((x) => x.segment === seg && x.cls === cls);
                      return (
                        <TableCell key={cls}>
                          <button onClick={() => setEdit({ segment: seg, cls })} className={cn("w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-primary", !a && "border-dashed border-[#E9B949] bg-[#FFF8E1]")}>
                            {a ? (
                              <>
                                <span className="block font-medium">{a.items.length} produk</span>
                                <span className="text-xs text-muted-foreground">{a.items.filter((i) => i.mustSell).length} wajib</span>
                              </>
                            ) : (
                              <>
                                <span className="flex items-center gap-1 font-medium text-[#6B5000]"><AlertTriangle className="h-3.5 w-3.5" /> Belum diatur</span>
                                <span className="text-xs text-muted-foreground">Cadangan: {settings.assortmentFallback === "all" ? "semua produk" : "kosong"}</span>
                              </>
                            )}
                          </button>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="outlet" className="mt-4">
          <PerOutlet />
        </TabsContent>
      </Tabs>

      {edit && <EditDialog segment={edit.segment} cls={edit.cls} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditDialog({ segment, cls, onClose }: { segment: string; cls: OutletClass; onClose: () => void }) {
  const { assortments, setAssortments, products, can, toast, addAudit, user, outlets } = useApp();
  const current = assortments.find((a) => a.segment === segment && a.cls === cls);
  const [items, setItems] = useState<AssortmentItem[]>(current?.items ?? []);
  const canEdit = current ? can("update_assortment") : can("create_assortment");
  const affected = outlets.filter((o) => o.active && o.segment === segment && o.cls === cls).length;
  const has = (pid: string) => items.find((i) => i.productId === pid);
  const toggle = (pid: string, on: boolean) => setItems((l) => (on ? [...l, { productId: pid, mustSell: false }] : l.filter((i) => i.productId !== pid)));
  const save = () => {
    setAssortments((l) => {
      const rec = { id: current?.id ?? `AS-${Date.now()}`, segment, cls, items, updatedBy: user?.name, updatedAt: nowStamp() };
      return current ? l.map((a) => (a.id === current.id ? rec : a)) : [...l, rec];
    });
    addAudit({ module: "Assortment", action: current ? "Assortment diubah" : "Assortment dibuat", target: `${segment} · Kelas ${cls}`, detail: `${items.length} produk, ${items.filter((i) => i.mustSell).length} wajib` });
    toast({ tone: "success", title: "Assortment disimpan", desc: `${affected} outlet terdampak. Katalog Mile Field diperbarui pada sinkronisasi berikutnya.` });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader><DialogTitle>Assortment · {segment} · Kelas {cls}</DialogTitle></DialogHeader>
        <div className="flex items-center gap-2 px-4 pt-3 text-sm text-muted-foreground">
          <Badge variant="neutral">{affected} outlet</Badge> {items.length} produk ditawarkan · {items.filter((i) => i.mustSell).length} wajib
          {current?.updatedAt && <span className="ml-auto text-xs">Terakhir diubah {current.updatedBy} · {current.updatedAt}</span>}
        </div>
        <div className="mile-scroll max-h-[440px] overflow-y-auto p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Produk</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>UoM</TableHead>
                <TableHead className="text-center">Wajib (must-sell)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.filter((p) => p.active !== false).map((p) => {
                const it = has(p.id);
                return (
                  <TableRow key={p.id} className={it ? "bg-accent/30" : undefined}>
                    <TableCell><Checkbox checked={!!it} disabled={!canEdit} onChange={(v) => toggle(p.id, v)} /></TableCell>
                    <TableCell><p className="font-medium">{p.name}</p><p className="font-mono text-xs text-muted-foreground">{p.sku}</p></TableCell>
                    <TableCell className="text-sm">{p.category}</TableCell>
                    <TableCell className="text-sm">{p.uoms.map((u) => u.uom).join(" / ")}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center"><Switch checked={!!it?.mustSell} disabled={!canEdit || !it} onChange={(v) => setItems((l) => l.map((i) => (i.productId === p.id ? { ...i, mustSell: v } : i)))} /></div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{canEdit ? "Batal" : "Tutup"}</Button>
          {canEdit && <Button onClick={save}>Simpan</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PerOutlet() {
  const { outlets, scopeSalesIds, assortmentFor, assortmentExceptions, setAssortmentExceptions, products, priceLists, can, addAudit, toast } = useApp();
  const [q, setQ] = useState("");
  const [outletId, setOutletId] = useState<string>("");
  const [addPid, setAddPid] = useState("");
  const candidates = useMemo(
    () => outlets.filter((o) => o.active && scopeSalesIds.includes(o.salesId) && (!q || `${o.name} ${o.code}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 8),
    [outlets, scopeSalesIds, q],
  );
  const outlet = outlets.find((o) => o.id === outletId);
  const canEdit = can("update_assortment");

  const priceOf = (o: Outlet, pid: string) => {
    const p = products.find((x) => x.id === pid)!;
    const pl = priceLists.find((l) => l.active && l.channel === o.priceGroup);
    const uom = p.uoms[0].uom;
    return { uom, price: pl?.items.find((i) => i.productId === pid && i.uom === uom)?.price ?? p.uoms[0].price };
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <CardContent className="space-y-2 p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari outlet" className="pl-8" />
          </div>
          {candidates.map((o) => (
            <button key={o.id} onClick={() => setOutletId(o.id)} className={cn("w-full rounded-md px-3 py-2 text-left text-sm", outletId === o.id ? "bg-accent text-accent-foreground" : "hover:bg-muted")}>
              <span className="block font-medium">{o.name}</span>
              <span className="text-xs text-muted-foreground">{o.segment} · Kelas {o.cls} · {o.priceGroup}</span>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        {!outlet ? (
          <EmptyState title="Pilih outlet" desc="Lihat katalog efektif outlet (seperti yang muncul di Mile Field) dan atur pengecualiannya." />
        ) : (() => {
          const eff = assortmentFor(outlet);
          const excluded = assortmentExceptions.filter((e) => e.outletId === outlet.id && e.kind === "exclude");
          const notOffered = products.filter((p) => p.active !== false && !eff.items.some((i) => i.productId === p.id));
          return (
            <>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{outlet.name}</span>
                  <Badge variant="neutral">{outlet.segment} · Kelas {outlet.cls}</Badge>
                  <Badge variant="info">Price list {outlet.priceGroup}</Badge>
                  {eff.fallback && <Badge variant="warning">Segmen × kelas belum diatur (aturan cadangan)</Badge>}
                </div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Smartphone className="h-3.5 w-3.5" /> Katalog ini menjadi daftar item Bill (Pesanan) di task kunjungan Mile Field; produk wajib sudah terisi qty 0.</p>
              </CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead>Harga ({outlet.priceGroup})</TableHead>
                    <TableHead>Sumber</TableHead>
                    <TableHead>Wajib</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eff.items.map((i) => {
                    const p = products.find((x) => x.id === i.productId)!;
                    const pr = priceOf(outlet, i.productId);
                    return (
                      <TableRow key={i.productId}>
                        <TableCell><p className="font-medium">{p.name}</p><p className="font-mono text-xs text-muted-foreground">{p.sku}</p></TableCell>
                        <TableCell className="text-sm">{rupiah(pr.price)} / {pr.uom}</TableCell>
                        <TableCell>{i.source === "include" ? <Badge variant="orange">Tambahan outlet</Badge> : i.source === "fallback" ? <Badge variant="warning">Cadangan</Badge> : <Badge variant="neutral">Assortment</Badge>}</TableCell>
                        <TableCell>{i.mustSell ? <Badge variant="success">Wajib</Badge> : "—"}</TableCell>
                        <TableCell>
                          {canEdit && (
                            <button title={i.source === "include" ? "Hapus tambahan" : "Kecualikan untuk outlet ini"} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                              onClick={() => {
                                setAssortmentExceptions((l) => i.source === "include"
                                  ? l.filter((e) => !(e.outletId === outlet.id && e.productId === i.productId))
                                  : [...l, { id: `AX-${Date.now()}`, outletId: outlet.id, productId: i.productId, kind: "exclude" }]);
                                addAudit({ module: "Assortment", action: i.source === "include" ? "Tambahan outlet dihapus" : "Produk dikecualikan", target: outlet.name, detail: p.name });
                              }}>
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {eff.items.length === 0 && <EmptyState title="Tidak ada produk" desc="Atur assortment segmen × kelas atau tambahkan produk untuk outlet ini." />}
              <CardContent className="space-y-3 border-t p-4">
                {!canEdit && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" /> Mode lihat. Menambah / mengecualikan produk perlu permission <code>update_assortment</code> (default: Admin, Commercial Director).</p>
                )}
                {canEdit && notOffered.length === 0 && (
                  <p className="flex items-center gap-1 text-xs text-[#6B5000]"><AlertTriangle className="h-3.5 w-3.5" /> Semua produk aktif sudah ada di katalog outlet ini{eff.fallback ? " karena segmen × kelasnya belum diatur (aturan cadangan: semua produk)" : ""}. {eff.fallback ? "Atur assortment segmen × kelas dulu, lalu tambahkan produk khusus bila perlu." : ""}</p>
                )}
                {canEdit && notOffered.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={addPid} onValueChange={setAddPid}>
                      <SelectTrigger className="w-[320px]"><SelectValue placeholder="Tambah produk khusus outlet ini" /></SelectTrigger>
                      <SelectContent>{notOffered.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant="outline" disabled={!addPid} onClick={() => {
                      setAssortmentExceptions((l) => [...l.filter((e) => !(e.outletId === outlet.id && e.productId === addPid)), { id: `AX-${Date.now()}`, outletId: outlet.id, productId: addPid, kind: "include" }]);
                      addAudit({ module: "Assortment", action: "Produk ditambahkan untuk outlet", target: outlet.name, detail: products.find((p) => p.id === addPid)!.name });
                      toast({ tone: "success", title: "Produk ditambahkan untuk outlet ini" });
                      setAddPid("");
                    }}><Plus /> Tambah</Button>
                  </div>
                )}
                {excluded.length > 0 && (
                  <div className="text-sm">
                    <p className="mb-1 font-medium">Dikecualikan untuk outlet ini</p>
                    <div className="flex flex-wrap gap-1.5">
                      {excluded.map((e) => (
                        <span key={e.id} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                          {products.find((p) => p.id === e.productId)?.name}
                          {canEdit && <button title="Batalkan pengecualian" onClick={() => setAssortmentExceptions((l) => l.filter((x) => x.id !== e.id))}><X className="h-3 w-3" /></button>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </>
          );
        })()}
      </Card>
    </div>
  );
}
