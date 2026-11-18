import { useState } from "react";
import { Copy, Download, FileSpreadsheet, History, Save, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { BRANCHES, CURRENT_MONTH, PRODUCTS } from "@/data/mock";
import type { TargetChange, TargetRow } from "@/data/types";
import { fmtDate, fmtMonth, nowStamp, pct, rupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

type Dim = "sales" | "branch" | "category" | "product";
type Measure = "value" | "qty";
const MONTHS = ["2026-10", "2026-11", "2026-12"];
const LEVEL: Record<Dim, string> = { sales: "Sales", branch: "Cabang", category: "Kategori", product: "Produk" };
const DIM_TABS: [Dim, string][] = [
  ["sales", "Per Sales"],
  ["branch", "Per Cabang"],
  ["category", "Per Kategori"],
  ["product", "Per Produk (SKU)"],
];

const IMPORT_REJECTS = [
  { row: 7, ref: "SBY99", reason: "Kode sales tidak dikenal" },
  { row: 15, ref: "UP-XXX-01", reason: "SKU tidak terdaftar di master produk" },
];

const num = (n: number) => Math.round(n).toLocaleString("id-ID");

export function TargetsPage() {
  const { targets, setTargets, inScope, user, can, toast, roleMeta, settings, targetLog, setTargetLog } = useApp();
  const [dim, setDim] = useState<Dim>("sales");
  const [measure, setMeasure] = useState<Measure>("value");
  const [month, setMonth] = useState(CURRENT_MONTH);
  /** original values of edited rows (key -> {target, targetQty}) until Simpan */
  const [orig, setOrig] = useState<Record<string, { target: number; targetQty?: number }>>({});
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [imp, setImp] = useState<{ step: 1 | 2 | 3; file?: string } | null>(null);
  const scopeAll = roleMeta(user!.role).scope === "all";
  const editable = can("update_target") && month >= CURRENT_MONTH;
  const qtyAllowed = dim === "category" || dim === "product";
  const m: Measure = qtyAllowed ? measure : "value";
  const dirty = Object.keys(orig).length > 0;

  const rows = targets[dim].filter((t) => {
    if (t.month !== month) return false;
    if (dim === "sales") return inScope(t.key);
    if (dim === "branch") return scopeAll || t.key === user!.branchId;
    return true;
  });
  const label = (key: string) => {
    if (dim === "sales") return { name: salesOf(key).name, sub: branchOf(salesOf(key).branchId).name };
    if (dim === "branch") {
      const b = BRANCHES.find((x) => x.id === key)!;
      return { name: b.name, sub: b.city };
    }
    if (dim === "category") return { name: key, sub: `${PRODUCTS.filter((p) => p.category === key).length} SKU` };
    const p = PRODUCTS.find((x) => x.id === key)!;
    return { name: p.name, sub: `${p.sku} · ${p.category} · UoM dasar ${p.uoms[0].uom}` };
  };
  const tVal = (r: TargetRow) => (m === "qty" ? r.targetQty ?? 0 : r.target);
  const aVal = (r: TargetRow) => (m === "qty" ? r.actualQty ?? 0 : r.actual);
  const fmt = (n: number) => (m === "qty" ? num(n) : rupiah(n));

  const totalT = rows.reduce((a, r) => a + tVal(r), 0);
  const totalA = rows.reduce((a, r) => a + aVal(r), 0);

  const editCell = (r: TargetRow, v: number) => {
    if (!orig[r.key]) setOrig((o) => ({ ...o, [r.key]: { target: r.target, targetQty: r.targetQty } }));
    setTargets((t) => ({
      ...t,
      [dim]: t[dim].map((x) => (x.key === r.key && x.month === month ? (m === "qty" ? { ...x, targetQty: v } : { ...x, target: v }) : x)),
    }));
  };

  const save = () => {
    const stamp = nowStamp();
    const changes: TargetChange[] = [];
    Object.entries(orig).forEach(([key, o]) => {
      const cur = targets[dim].find((x) => x.key === key && x.month === month);
      if (!cur) return;
      if (cur.target !== o.target) changes.push({ at: stamp, by: user!.name, level: LEVEL[dim], key, month, field: "nilai", from: o.target, to: cur.target, source: "layar" });
      if ((cur.targetQty ?? 0) !== (o.targetQty ?? 0))
        changes.push({ at: stamp, by: user!.name, level: LEVEL[dim], key, month, field: "qty", from: o.targetQty ?? 0, to: cur.targetQty ?? 0, source: "layar" });
    });
    setTargetLog((l) => [...changes, ...l]);
    setOrig({});
    toast({ tone: "success", title: "Target disimpan", desc: `${fmtMonth(month)} · ${changes.length} perubahan tercatat di riwayat` });
  };

  const doCopy = () => {
    setTargets((t) => ({
      ...t,
      [dim]: t[dim].map((r) => {
        if (r.month !== month) return r;
        const prev = t[dim].find((x) => x.key === r.key && x.month === CURRENT_MONTH);
        return prev ? { ...r, target: prev.target, targetQty: prev.targetQty } : r;
      }),
    }));
    setCopyConfirm(false);
    toast({ tone: "success", title: "Target disalin", desc: `Dari ${fmtMonth(CURRENT_MONTH)} ke ${fmtMonth(month)}` });
  };

  const processImport = () => {
    const stamp = nowStamp();
    const affected = rows.slice(0, 3);
    const changes: TargetChange[] = affected.map((r) => ({
      at: stamp,
      by: user!.name,
      level: LEVEL[dim],
      key: r.key,
      month,
      field: "nilai",
      from: r.target,
      to: Math.round((r.target * 1.05) / 1_000_000) * 1_000_000,
      source: "import",
    }));
    setTargets((t) => ({
      ...t,
      [dim]: t[dim].map((x) => {
        const c = changes.find((ch) => ch.key === x.key && x.month === month);
        return c ? { ...x, target: c.to } : x;
      }),
    }));
    setTargetLog((l) => [...changes, ...l]);
    setImp(null);
    toast({ tone: "success", title: "Import target selesai", desc: `18 baris diterima, 2 ditolak · ${changes.length} target ${LEVEL[dim].toLowerCase()} berubah · tercatat di Riwayat import` });
  };

  const history = targetLog.filter((c) => c.key === historyKey);
  const historyLabel = historyKey ? label(historyKey).name : "";
  const monthHasValues = targets[dim].some((r) => r.month === month && r.target > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Target"
        subtitle={
          settings.variant === "A"
            ? "Target per sales, cabang, kategori dan produk per bulan (nilai dan / atau qty). Aktual harian dari pesanan yang disetujui di modul; angka resmi bulanan dari invoice Odoo."
            : "Target per sales, cabang, kategori dan produk per bulan (nilai dan / atau qty). Aktual dari pesanan yang disetujui / selesai di modul."
        }
        action={
          <>
            {can("import_data") && (
              <Button variant="outline" onClick={() => setImp({ step: 1 })}>
                <Upload /> Import Excel
              </Button>
            )}
            {can("create_target") && month > CURRENT_MONTH && (
              <Button variant="outline" onClick={() => (monthHasValues ? setCopyConfirm(true) : doCopy())}>
                <Copy /> Salin dari bulan ini
              </Button>
            )}
            {editable && (
              <Button disabled={!dirty} onClick={save}>
                <Save /> Simpan
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
          {DIM_TABS.map(([k, l]) => (
            <button
              key={k}
              disabled={dirty && k !== dim}
              title={dirty && k !== dim ? "Simpan perubahan dulu" : undefined}
              onClick={() => setDim(k)}
              className={cn("h-[30px] whitespace-nowrap rounded-sm px-3 text-sm font-medium disabled:opacity-50", dim === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 rounded-md bg-muted p-1" title={qtyAllowed ? undefined : "Qty tidak berlaku untuk dimensi ini"}>
          {(
            [
              ["value", "Nilai (Rp)"],
              ["qty", "Qty"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              disabled={!qtyAllowed && k === "qty"}
              onClick={() => setMeasure(k)}
              className={cn("h-[30px] whitespace-nowrap rounded-sm px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50", m === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}
            >
              {l}
            </button>
          ))}
        </div>
        <Select value={month} onValueChange={setMonth} disabled={dirty}>
          <SelectTrigger className="w-[200px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((mo) => (
              <SelectItem key={mo} value={mo}>
                {fmtMonth(mo)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!qtyAllowed && <span className="text-xs text-muted-foreground">Qty tidak berlaku untuk dimensi ini</span>}
        {!editable && <Badge variant="neutral">{month < CURRENT_MONTH ? "Bulan sudah tutup (read-only)" : "Read-only: butuh update_target"}</Badge>}
        {dirty && <Badge variant="warning">Perubahan belum disimpan</Badge>}
        <span className="ml-auto text-sm text-muted-foreground">
          Total target <b className="text-foreground">{fmt(totalT)}</b> · aktual <b className="text-foreground">{fmt(totalA)}</b> ({pct(totalA, totalT)}%)
        </span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No.</TableHead>
              <TableHead>{LEVEL[dim]}</TableHead>
              <TableHead className="w-[220px] text-right">{m === "qty" ? "Target (qty, UoM dasar)" : "Target (Rp)"}</TableHead>
              <TableHead className="text-right">Aktual</TableHead>
              <TableHead className="w-[240px]">Pencapaian</TableHead>
              <TableHead className="w-[110px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const l = label(r.key);
              const p = pct(aVal(r), tVal(r));
              const nChanges = targetLog.filter((c) => c.key === r.key).length;
              return (
                <TableRow key={r.key}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{l.sub}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {editable ? (
                      <Input type="number" className="h-[31px] text-right" value={tVal(r)} onChange={(e) => editCell(r, Number(e.target.value))} />
                    ) : (
                      fmt(tVal(r))
                    )}
                  </TableCell>
                  <TableCell className="text-right">{fmt(aVal(r))}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#E8E8E8]">
                        <div className={cn("h-full rounded-full", p >= 70 ? "bg-[#198754]" : p >= 50 ? "bg-primary" : "bg-[#FFC105]")} style={{ width: `${Math.min(100, p)}%` }} />
                      </div>
                      <span className="w-10 text-right text-xs font-semibold">{p}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <button onClick={() => setHistoryKey(r.key)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <History className="h-3.5 w-3.5" /> Riwayat{nChanges ? ` (${nChanges})` : ""}
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* change log */}
      <Dialog open={!!historyKey} onOpenChange={(v) => !v && setHistoryKey(null)}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0">
          <DialogHeader>
            <DialogTitle>Riwayat Perubahan Target</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 p-4">
            <p className="text-sm font-semibold">
              {LEVEL[dim]}: {historyLabel}
            </p>
            {history.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada perubahan target</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Bulan</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead className="text-right">Lama → Baru</TableHead>
                    <TableHead>Pengguna</TableHead>
                    <TableHead>Sumber</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{fmtDate(c.at)}</TableCell>
                      <TableCell className="text-xs">{fmtMonth(c.month)}</TableCell>
                      <TableCell className="text-xs">{c.field === "qty" ? "Qty" : "Nilai"}</TableCell>
                      <TableCell className="text-right text-xs">
                        {c.field === "qty" ? num(c.from) : rupiah(c.from)} → <b>{c.field === "qty" ? num(c.to) : rupiah(c.to)}</b>
                      </TableCell>
                      <TableCell className="text-xs">{c.by}</TableCell>
                      <TableCell>
                        <Badge variant={c.source === "import" ? "info" : "neutral"}>{c.source === "import" ? "Import" : "Layar"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* copy confirm */}
      <Dialog open={copyConfirm} onOpenChange={setCopyConfirm}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Salin Target</DialogTitle>
          </DialogHeader>
          <p className="p-4 text-sm">
            {fmtMonth(month)} sudah berisi target {LEVEL[dim].toLowerCase()}. Timpa dengan target {fmtMonth(CURRENT_MONTH)}?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyConfirm(false)}>
              Batal
            </Button>
            <Button onClick={doCopy}>
              <Copy /> Salin &amp; timpa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* import */}
      <Dialog open={!!imp} onOpenChange={(v) => !v && setImp(null)}>
        <DialogContent className="gap-0 p-0">
          <DialogHeader>
            <DialogTitle>Import Target</DialogTitle>
          </DialogHeader>
          {imp && (
            <div className="space-y-4 p-4 text-sm">
              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                <div>
                  <p className="font-medium">1. Unduh template</p>
                  <p className="text-xs text-muted-foreground">Kolom: bulan, level, kode sales / cabang, kode kategori / SKU, target nilai, target qty</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => toast({ tone: "info", title: "Template diunduh", desc: "template-target.xlsx" })}>
                  <Download /> Template
                </Button>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                <div>
                  <p className="font-medium">2. Unggah file</p>
                  <p className="text-xs text-muted-foreground">{imp.file ?? "Belum ada file"}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setImp({ step: 2, file: `target-${month}.xlsx` })}>
                  <FileSpreadsheet /> Pilih file
                </Button>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-medium">3. Dry run (validasi)</p>
                  <Button size="sm" variant="outline" disabled={!imp.file} onClick={() => setImp({ ...imp, step: 3 })}>
                    Validasi
                  </Button>
                </div>
                {imp.step === 3 && (
                  <div className="mt-2 space-y-2">
                    <div className="flex gap-2">
                      <Badge variant="success">18 baris valid</Badge>
                      <Badge variant="danger">2 baris ditolak</Badge>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Baris</TableHead>
                          <TableHead>Kode</TableHead>
                          <TableHead>Alasan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {IMPORT_REJECTS.map((r) => (
                          <TableRow key={r.row}>
                            <TableCell className="text-xs">{r.row}</TableCell>
                            <TableCell className="font-mono text-xs">{r.ref}</TableCell>
                            <TableCell className="text-xs">{r.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <button className="text-xs text-primary hover:underline" onClick={() => toast({ tone: "info", title: "Baris ditolak diunduh", desc: "target-ditolak.xlsx · 2 baris" })}>
                      Unduh baris ditolak
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImp(null)}>
              Batal
            </Button>
            <Button disabled={imp?.step !== 3} onClick={processImport}>
              Proses baris valid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
