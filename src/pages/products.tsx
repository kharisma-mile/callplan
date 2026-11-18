import { useMemo, useState } from "react";
import { Database, Download, Eye, MoreHorizontal, Pencil, Plus, Power, Search, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/switch";
import { EmptyState } from "@/components/empty-state";
import { useApp } from "@/store/app-store";
import { PRICE_GROUPS } from "@/data/mock";
import type { PriceList, Product, UomPrice } from "@/data/types";
import { fmtDate, rupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

function RowMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProductsPage() {
  const { can, settings, toast } = useApp();
  const tabs = [
    ...(can("view_any_product") ? ([["product", "Produk"]] as const) : []),
    ...(can("view_any_price_list") ? ([["price_list", "Price List"]] as const) : []),
  ];
  const [tab, setTab] = useState<string>(tabs[0]?.[0] ?? "product");
  const A = settings.variant === "A";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produk & Price List"
        subtitle="Master produk dengan konversi UoM, dan price list per channel / region. Dipakai untuk cek harga dan UoM di Review Pesanan dan katalog Mile Field."
        action={
          can("export_data") && (
            <Button variant="outline" onClick={() => toast({ tone: "success", title: "Export Excel dibuat", desc: `${tab === "product" ? "produk" : "price-list"}-${Date.now().toString().slice(-5)}.xlsx` })}>
              <Download /> Export
            </Button>
          )
        }
      />
      {A && (
        <div className="flex items-center gap-2 rounded-md border border-[#9FE1FE] bg-[#E6F7FF] p-3 text-sm text-[#01496A]">
          <Database className="h-4 w-4" /> Data dikelola di Odoo · sinkron terakhir 17 Nov 2026 10:00. Perubahan dilakukan di Odoo (Varian A).
        </div>
      )}
      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-muted p-1">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-[30px] whitespace-nowrap rounded-sm px-3 text-sm font-medium", tab === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "product" && can("view_any_product") && <ProductTab readOnly={A} />}
      {tab === "price_list" && can("view_any_price_list") && <PriceListTab readOnly={A} />}
    </div>
  );
}

/* ---------------- products ---------------- */
const blankProduct = (): Product => ({ id: "", sku: "", name: "", category: "Kantong", uoms: [{ uom: "pack", price: 0, conv: 1 }], active: true });

function ProductTab({ readOnly }: { readOnly: boolean }) {
  const { products, setProducts, can, toast, addAudit } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [edit, setEdit] = useState<Product | null>(null);
  const [del, setDel] = useState<Product | null>(null);
  const cats = Array.from(new Set(products.map((p) => p.category)));
  const rows = products.filter((p) => (cat === "all" || p.category === cat) && (q === "" || `${p.sku} ${p.name}`.toLowerCase().includes(q.toLowerCase())));
  const canCreate = !readOnly && can("create_product");
  const canUpdate = !readOnly && can("update_product");
  const canDelete = !readOnly && can("delete_product");

  const save = () => {
    if (!edit) return;
    if (!edit.id) {
      const p = { ...edit, id: `P${Date.now().toString().slice(-6)}` };
      setProducts((l) => [p, ...l]);
      addAudit({ module: "Produk", action: "Produk dibuat", target: `${p.sku} · ${p.name}` });
      toast({ tone: "success", title: "Produk dibuat", desc: p.name });
    } else {
      setProducts((l) => l.map((x) => (x.id === edit.id ? edit : x)));
      addAudit({ module: "Produk", action: "Produk diubah", target: `${edit.sku} · ${edit.name}` });
      toast({ tone: "success", title: "Produk diperbarui", desc: edit.name });
    }
    setEdit(null);
  };
  const setUom = (i: number, patch: Partial<UomPrice>) => edit && setEdit({ ...edit, uoms: edit.uoms.map((u, j) => (j === i ? { ...u, ...patch } : u)) });

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <div className="relative w-[280px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cari SKU atau nama..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {cats.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="neutral">{rows.length} produk</Badge>
        {canCreate && (
          <Button className="ml-auto" onClick={() => setEdit(blankProduct())}>
            <Plus /> Buat Produk
          </Button>
        )}
      </CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead>Produk</TableHead>
            <TableHead>Kategori</TableHead>
            <TableHead>UoM &amp; konversi</TableHead>
            <TableHead className="text-right">Harga dasar</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p, i) => (
            <TableRow key={p.id}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>
                <p className="font-medium">{p.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
              </TableCell>
              <TableCell>{p.category}</TableCell>
              <TableCell className="text-xs">
                <p>
                  Dasar: <b>{p.uoms[0]?.uom}</b>
                </p>
                {p.uoms.slice(1).map((u) => (
                  <p key={u.uom} className="text-muted-foreground">
                    1 {u.uom} = {u.conv} {p.uoms[0].uom}
                  </p>
                ))}
              </TableCell>
              <TableCell className="text-right">
                {rupiah(p.uoms[0]?.price ?? 0)}
                <span className="block text-xs text-muted-foreground">/ {p.uoms[0]?.uom}</span>
              </TableCell>
              <TableCell>{p.active === false ? <Badge variant="neutral">Nonaktif</Badge> : <Badge variant="success">Aktif</Badge>}</TableCell>
              <TableCell>
                {(canUpdate || canDelete) && (
                  <RowMenu>
                    {canUpdate && (
                      <>
                        <DropdownMenuItem onClick={() => setEdit(p)}>
                          <Pencil /> Ubah
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            const active = p.active === false;
                            setProducts((l) => l.map((x) => (x.id === p.id ? { ...x, active } : x)));
                            addAudit({ module: "Produk", action: active ? "Produk diaktifkan" : "Produk dinonaktifkan", target: `${p.sku} · ${p.name}` });
                            toast({ tone: "info", title: active ? "Produk diaktifkan" : "Produk dinonaktifkan", desc: p.name });
                          }}
                        >
                          <Power /> {p.active === false ? "Aktifkan" : "Nonaktifkan"}
                        </DropdownMenuItem>
                      </>
                    )}
                    {canDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDel(p)} className="text-destructive focus:text-destructive">
                          <Trash2 /> Hapus
                        </DropdownMenuItem>
                      </>
                    )}
                  </RowMenu>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <EmptyState title="Data tidak ditemukan" desc="Ubah filter atau kata kunci pencarian." />}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0">
          {edit && (
            <>
              <DialogHeader>
                <DialogTitle>{edit.id ? "Ubah Produk" : "Buat Produk"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 p-4">
                <div className="space-y-1">
                  <Label>SKU</Label>
                  <Input value={edit.sku} onChange={(e) => setEdit({ ...edit, sku: e.target.value })} placeholder="UP-XXX-000" />
                </div>
                <div className="space-y-1">
                  <Label>Kategori</Label>
                  <Input value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Nama produk</Label>
                  <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>UoM, konversi &amp; harga (baris pertama = UoM dasar)</Label>
                  {edit.uoms.map((u, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input className="w-28" value={u.uom} onChange={(e) => setUom(i, { uom: e.target.value })} placeholder="UoM" />
                      <span className="text-xs text-muted-foreground">=</span>
                      <Input className="w-24 text-right" type="number" disabled={i === 0} value={u.conv} onChange={(e) => setUom(i, { conv: Number(e.target.value) })} />
                      <span className="w-16 text-xs text-muted-foreground">{edit.uoms[0].uom || "dasar"}</span>
                      <Input className="flex-1 text-right" type="number" value={u.price} onChange={(e) => setUom(i, { price: Number(e.target.value) })} placeholder="Harga" />
                      {i > 0 ? (
                        <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" onClick={() => setEdit({ ...edit, uoms: edit.uoms.filter((_, j) => j !== i) })}>
                          <X className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="w-8" />
                      )}
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, uoms: [...edit.uoms, { uom: "", conv: 1, price: 0 }] })}>
                    <Plus /> Tambah UoM
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEdit(null)}>
                  Batal
                </Button>
                <Button onClick={save} disabled={!edit.sku || !edit.name || edit.uoms.some((u) => !u.uom)}>
                  Simpan
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Hapus Produk</DialogTitle>
          </DialogHeader>
          <p className="p-4 text-sm">
            Hapus <b>{del?.name}</b>? Produk yang sudah dipakai di pesanan sebaiknya dinonaktifkan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setProducts((l) => l.filter((x) => x.id !== del!.id));
                addAudit({ module: "Produk", action: "Produk dihapus", target: `${del!.sku} · ${del!.name}` });
                toast({ tone: "danger", title: "Produk dihapus", desc: del!.name });
                setDel(null);
              }}
            >
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- price lists ---------------- */
function PriceListTab({ readOnly }: { readOnly: boolean }) {
  const { priceLists, setPriceLists, products, regions, can, toast, addAudit } = useApp();
  const [edit, setEdit] = useState<PriceList | null>(null);
  const [view, setView] = useState<PriceList | null>(null);
  const [del, setDel] = useState<PriceList | null>(null);
  const canCreate = !readOnly && can("create_price_list");
  const canUpdate = !readOnly && can("update_price_list");
  const canDelete = !readOnly && can("delete_price_list");
  const regionName = (id: string) => (id === "all" ? "Semua region" : regions.find((r) => r.id === id)?.name ?? id);
  const pname = (id: string) => products.find((p) => p.id === id);

  const blank = (): PriceList => ({
    id: "",
    name: "",
    channel: PRICE_GROUPS[0],
    regionId: "all",
    validFrom: "2026-12-01",
    active: true,
    items: products.flatMap((p) => p.uoms.map((u) => ({ productId: p.id, uom: u.uom, price: u.price }))),
  });

  const save = () => {
    if (!edit) return;
    if (!edit.id) {
      const pl = { ...edit, id: `PL${Date.now().toString().slice(-5)}` };
      setPriceLists((l) => [pl, ...l]);
      addAudit({ module: "Price List", action: "Price list dibuat", target: pl.name });
      toast({ tone: "success", title: "Price list dibuat", desc: pl.name });
    } else {
      setPriceLists((l) => l.map((x) => (x.id === edit.id ? edit : x)));
      addAudit({ module: "Price List", action: "Price list diubah", target: edit.name });
      toast({ tone: "success", title: "Price list diperbarui", desc: `${edit.name} · berlaku untuk pesanan baru` });
    }
    setEdit(null);
  };

  const itemsTable = (pl: PriceList, editable: boolean) => (
    <div className="mile-scroll max-h-[320px] overflow-y-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead>Produk</TableHead>
            <TableHead>UoM</TableHead>
            <TableHead className="w-[160px] text-right">Harga</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pl.items.map((it, i) => (
            <TableRow key={`${it.productId}-${it.uom}`}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>
                <p className="text-sm font-medium">{pname(it.productId)?.name ?? it.productId}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{pname(it.productId)?.sku}</p>
              </TableCell>
              <TableCell>{it.uom}</TableCell>
              <TableCell className="text-right">
                {editable ? (
                  <Input
                    type="number"
                    className="h-[31px] text-right"
                    value={it.price}
                    onChange={(e) => setEdit({ ...pl, items: pl.items.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)) })}
                  />
                ) : (
                  rupiah(it.price)
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const rows = useMemo(() => [...priceLists], [priceLists]);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4 p-4">
        <p className="text-sm text-muted-foreground">Price list per channel (= price group outlet) dan region. Harga dievaluasi di modul saat cek pesanan.</p>
        {canCreate && (
          <Button className="ml-auto" onClick={() => setEdit(blank())}>
            <Plus /> Buat Price List
          </Button>
        )}
      </CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">No.</TableHead>
            <TableHead>Nama</TableHead>
            <TableHead>Channel / price group</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Berlaku</TableHead>
            <TableHead className="text-right">Item</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((pl, i) => (
            <TableRow key={pl.id} className="cursor-pointer" onClick={() => setView(pl)}>
              <TableCell>{i + 1}</TableCell>
              <TableCell className="font-medium">{pl.name}</TableCell>
              <TableCell>
                <Badge variant="info">{pl.channel}</Badge>
              </TableCell>
              <TableCell>{regionName(pl.regionId)}</TableCell>
              <TableCell className="text-xs">
                {fmtDate(pl.validFrom)} – {pl.validTo ? fmtDate(pl.validTo) : "seterusnya"}
              </TableCell>
              <TableCell className="text-right">{pl.items.length}</TableCell>
              <TableCell>{pl.active ? <Badge variant="success">Aktif</Badge> : <Badge variant="neutral">Nonaktif</Badge>}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <RowMenu>
                  <DropdownMenuItem onClick={() => setView(pl)}>
                    <Eye /> Lihat detail
                  </DropdownMenuItem>
                  {canUpdate && (
                    <DropdownMenuItem onClick={() => setEdit(pl)}>
                      <Pencil /> Ubah
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDel(pl)} className="text-destructive focus:text-destructive">
                        <Trash2 /> Hapus
                      </DropdownMenuItem>
                    </>
                  )}
                </RowMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <EmptyState title="Belum ada price list" desc="Buat price list atau import dari menu Data." />}

      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0">
          {view && (
            <>
              <DialogHeader>
                <DialogTitle>Detail Price List</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 p-4">
                <div>
                  <p className="text-lg font-bold">{view.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {view.channel} · {regionName(view.regionId)} · {fmtDate(view.validFrom)} – {view.validTo ? fmtDate(view.validTo) : "seterusnya"}
                  </p>
                </div>
                {itemsTable(view, false)}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0">
          {edit && (
            <>
              <DialogHeader>
                <DialogTitle>{edit.id ? "Ubah Price List" : "Buat Price List"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <Label>Nama price list</Label>
                    <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="mis. Grosir 2027" />
                  </div>
                  <div className="space-y-1">
                    <Label>Channel / price group</Label>
                    <Select value={edit.channel} onValueChange={(v) => setEdit({ ...edit, channel: v })}>
                      <SelectTrigger>
                        <SelectValue />
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
                  <div className="space-y-1">
                    <Label>Region</Label>
                    <Select value={edit.regionId} onValueChange={(v) => setEdit({ ...edit, regionId: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Semua region</SelectItem>
                        {regions.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Berlaku mulai</Label>
                    <Input type="date" value={edit.validFrom} onChange={(e) => setEdit({ ...edit, validFrom: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Berlaku sampai (opsional)</Label>
                    <Input type="date" value={edit.validTo ?? ""} onChange={(e) => setEdit({ ...edit, validTo: e.target.value || undefined })} />
                  </div>
                  <div className="col-span-2 flex items-center justify-between">
                    <Label>Aktif</Label>
                    <Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} />
                  </div>
                </div>
                {itemsTable(edit, true)}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEdit(null)}>
                  Batal
                </Button>
                <Button onClick={save} disabled={!edit.name || (!!edit.validTo && edit.validTo < edit.validFrom)}>
                  Simpan
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Hapus Price List</DialogTitle>
          </DialogHeader>
          <p className="p-4 text-sm">
            Hapus <b>{del?.name}</b>? Pesanan yang sudah dibuat tetap memakai harga saat dibuat.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setPriceLists((l) => l.filter((x) => x.id !== del!.id));
                addAudit({ module: "Price List", action: "Price list dihapus", target: del!.name });
                toast({ tone: "danger", title: "Price list dihapus", desc: del!.name });
                setDel(null);
              }}
            >
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
