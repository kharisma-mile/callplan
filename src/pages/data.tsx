import { useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCw, RotateCcw, Server, Upload, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApp } from "@/store/app-store";
import { IMPORT_TEMPLATES } from "@/data/mock";
import { fmtDate, nowStamp } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DataPage() {
  const { settings } = useApp();
  return settings.variant === "A" ? <OdooSync /> : <ExcelImport />;
}

/* ---------------- Variant A ---------------- */
function OdooSync() {
  const { syncDomains, setSyncDomains, syncErrors, setSyncErrors, can, toast } = useApp();
  const [busy, setBusy] = useState<string[]>([]);
  const canSync = can("sync_data");
  const open = syncErrors.filter((e) => !e.resolved);

  const runSync = (key: string) => {
    setBusy((b) => [...b, key]);
    setSyncDomains((d) => d.map((x) => (x.key === key ? { ...x, status: "running" } : x)));
    setTimeout(() => {
      setBusy((b) => b.filter((k) => k !== key));
      setSyncDomains((d) => d.map((x) => (x.key === key ? { ...x, status: x.errors > 0 ? "error" : "ok", lastSync: nowStamp(), records: x.records + Math.floor(Math.random() * 4) } : x)));
      const d = syncDomains.find((x) => x.key === key);
      toast({ tone: d && d.errors > 0 ? "warning" : "success", title: `Sinkron ${d?.name} selesai`, desc: d && d.errors > 0 ? `${d.errors} error masih terbuka, lihat log di bawah` : "Tidak ada error" });
    }, 1400);
  };
  const retry = (id: string) => {
    const e = syncErrors.find((x) => x.id === id)!;
    setBusy((b) => [...b, id]);
    setTimeout(() => {
      setBusy((b) => b.filter((k) => k !== id));
      setSyncErrors((l) => l.map((x) => (x.id === id ? { ...x, resolved: true } : x)));
      setSyncDomains((d) => d.map((x) => (x.key === e.domain ? { ...x, errors: Math.max(0, x.errors - 1), status: x.errors - 1 > 0 ? "error" : "ok", lastSync: nowStamp() } : x)));
      toast({ tone: "success", title: "Retry berhasil", desc: e.ref });
    }, 1200);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sinkronisasi Odoo"
        subtitle="Varian A: Odoo adapter di Modul Sales Operations. Master data dari Odoo, pesanan menjadi Sales Order draft di Odoo."
        action={
          canSync && (
            <Button onClick={() => syncDomains.forEach((d) => runSync(d.key))}>
              <RefreshCw /> Sinkron semua
            </Button>
          )
        }
      />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4 text-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">Odoo UP · koneksi aktif</p>
            <p className="text-xs text-muted-foreground">Odoo external API via HTTPS · integration user khusus · adapter version-aware (17 / 18 / 19+)</p>
          </div>
          <Badge variant="success" className="ml-auto">
            Terhubung
          </Badge>
          <Badge variant={open.length ? "danger" : "neutral"}>{open.length} error terbuka</Badge>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No.</TableHead>
              <TableHead>Domain data</TableHead>
              <TableHead>Arah</TableHead>
              <TableHead>Jadwal</TableHead>
              <TableHead>Sinkron terakhir</TableHead>
              <TableHead className="text-right">Record</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {syncDomains.map((d, i) => (
              <TableRow key={d.key}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-xs">{d.direction}</TableCell>
                <TableCell className="text-xs">{d.schedule}</TableCell>
                <TableCell className="text-xs">{fmtDate(d.lastSync)}</TableCell>
                <TableCell className="text-right">{d.records.toLocaleString("id-ID")}</TableCell>
                <TableCell>
                  {d.status === "running" ? (
                    <Badge variant="info">
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Berjalan
                    </Badge>
                  ) : d.status === "ok" ? (
                    <Badge variant="success">OK</Badge>
                  ) : (
                    <Badge variant="danger">{d.errors} error</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {canSync && (
                    <Button size="sm" variant="outline" disabled={busy.includes(d.key)} onClick={() => runSync(d.key)}>
                      <RefreshCw className={cn(busy.includes(d.key) && "animate-spin")} /> Sinkron
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log error sinkron</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No.</TableHead>
              <TableHead>Waktu</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Referensi</TableHead>
              <TableHead>Pesan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {syncErrors.map((e, i) => (
              <TableRow key={e.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="text-xs">{fmtDate(e.at)}</TableCell>
                <TableCell className="text-xs">{syncDomains.find((d) => d.key === e.domain)?.name}</TableCell>
                <TableCell className="font-mono text-xs">{e.ref}</TableCell>
                <TableCell className="max-w-[360px] text-xs">{e.message}</TableCell>
                <TableCell>{e.resolved ? <Badge variant="success">Selesai</Badge> : <Badge variant="danger">Terbuka</Badge>}</TableCell>
                <TableCell>
                  {canSync && !e.resolved && (
                    <Button size="sm" variant="outline" disabled={busy.includes(e.id)} onClick={() => retry(e.id)}>
                      <RotateCcw className={cn(busy.includes(e.id) && "animate-spin")} /> Retry
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="p-4 text-xs text-muted-foreground">Kegagalan sinkron juga dikirim ke kanal alert admin. Retry otomatis 3x dengan jeda bertahap sebelum masuk log.</p>
      </Card>
    </div>
  );
}

/* ---------------- Variant B ---------------- */
interface PreviewRow {
  row: number;
  key: string;
  name: string;
  ok: boolean;
  msg: string;
}

function ExcelImport() {
  const { importLogs, setImportLogs, can, toast, user } = useApp();
  const [dlg, setDlg] = useState<{ template: string; file?: string; stage: "pick" | "validating" | "preview" } | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const canImport = can("import_data");
  const canExport = can("export_data");
  const tplName = (k: string) => IMPORT_TEMPLATES.find((t) => t.key === k)!.name;

  const validate = () => {
    if (!dlg) return;
    setDlg({ ...dlg, stage: "validating" });
    setTimeout(() => {
      const rows: PreviewRow[] = Array.from({ length: 12 }, (_, i) => {
        const bad = i === 3 || i === 8 || i === 10;
        return {
          row: i + 2,
          key: dlg.template === "customer" ? `C-SBY-${String(1200 + i).padStart(4, "0")}` : dlg.template === "receivable" ? `C-JKT-${String(300 + i).padStart(4, "0")}` : `UP-SKU-${100 + i}`,
          name: ["Toko Plastik Sinar Jaya", "UD Makmur Abadi", "CV Mitra Kemasan", "Grosir Sumber Rejeki", "PT Prima Kemas", "Toko Cahaya Baru", "UD Sentosa", "Toko Harapan Jaya", "CV Bumi Kemasan", "Toko Mega Plastik", "UD Lancar Jaya", "Toko Duta Plastik"][i],
          ok: !bad,
          msg: bad ? (i === 3 ? "Kolom wajib 'cabang' kosong" : i === 8 ? "UoM 'dus' tidak terdaftar" : "Kode sales tidak ditemukan") : i % 4 === 0 ? "Update data" : "Baris baru",
        };
      });
      setPreview(rows);
      setDlg((d) => (d ? { ...d, stage: "preview" } : d));
    }, 1300);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import & Export Excel"
        subtitle="Varian B (standalone): data Odoo hanya dipakai sekali saat setup. Setelah go-live, perubahan data dilakukan lewat import / export Excel massal."
        action={
          canImport && (
            <Button onClick={() => setDlg({ template: "customer", stage: "pick" })}>
              <Upload /> Import Excel
            </Button>
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import awal dari Odoo (sekali saat setup)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 pt-0">
          {["UoM", "Produk", "Price list", "Pelanggan", "Saldo piutang & limit kredit", "Status beli pelanggan"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-md bg-[#D8F8E9] px-2 py-1 text-xs font-medium text-[#115A38]">
                <CheckCircle2 className="h-3.5 w-3.5" /> {s}
              </span>
              {i < 5 && <span className="text-muted-foreground">→</span>}
            </div>
          ))}
          <Badge variant="neutral" className="ml-auto">
            Selesai 2 Nov 2026 · Rina Kusuma
          </Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {IMPORT_TEMPLATES.map((t) => (
          <Card key={t.key}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#D8F8E9]">
                  <FileSpreadsheet className="h-5 w-5 text-[#198754]" />
                </div>
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => toast({ tone: "info", title: "Template diunduh", desc: `template-${t.key}.xlsx` })}>
                  <Download /> Template
                </Button>
                {canImport && t.key !== "order" && (
                  <Button size="sm" variant="outline" onClick={() => setDlg({ template: t.key, stage: "pick" })}>
                    <Upload /> Import
                  </Button>
                )}
                {canExport && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const n = 100 + Math.floor(Math.random() * 900);
                      setImportLogs((l) => [{ id: `L${Date.now()}`, kind: "Export", template: t.name, file: `${t.key}-export-${n}.xlsx`, by: user!.name, at: nowStamp(), accepted: n, rejected: 0 }, ...l]);
                      toast({ tone: "success", title: "Export selesai", desc: `${t.key}-export-${n}.xlsx · ${n} baris` });
                    }}
                  >
                    <Download /> Export
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat import / export</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No.</TableHead>
              <TableHead>Waktu</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Oleh</TableHead>
              <TableHead className="text-right">Diterima</TableHead>
              <TableHead className="text-right">Ditolak</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {importLogs.map((l, i) => (
              <TableRow key={l.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="text-xs">{fmtDate(l.at)}</TableCell>
                <TableCell>
                  <Badge variant={l.kind === "Import" ? "info" : "neutral"}>{l.kind}</Badge>
                </TableCell>
                <TableCell>{l.template}</TableCell>
                <TableCell className="font-mono text-xs">{l.file}</TableCell>
                <TableCell>{l.by}</TableCell>
                <TableCell className="text-right">{l.accepted.toLocaleString("id-ID")}</TableCell>
                <TableCell className={cn("text-right", l.rejected > 0 && "font-semibold text-[#BF2130]")}>{l.rejected}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)}>
        <DialogContent className={cn("gap-0 p-0", dlg?.stage === "preview" && "max-w-[93%] xl:max-w-[960px]")}>
          <DialogHeader>
            <DialogTitle>Import Data Excel</DialogTitle>
          </DialogHeader>
          {dlg && (
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Template</Label>
                  <Select value={dlg.template} onValueChange={(v) => setDlg({ ...dlg, template: v, stage: "pick", file: undefined })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IMPORT_TEMPLATES.filter((t) => t.key !== "order").map((t) => (
                        <SelectItem key={t.key} value={t.key}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>File</Label>
                  <button
                    onClick={() => setDlg({ ...dlg, file: `${dlg.template}-update-nov-2026.xlsx` })}
                    className="flex h-[38px] w-full items-center gap-2 rounded-md border border-dashed border-[#9C9C9C] px-3 text-left text-sm text-muted-foreground hover:border-primary"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    {dlg.file ?? "Pilih file .xlsx (simulasi)"}
                  </button>
                </div>
              </div>
              {dlg.stage === "validating" && (
                <p className="flex items-center gap-2 text-sm text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" /> Memvalidasi template, kolom wajib, referensi kode...
                </p>
              )}
              {dlg.stage === "preview" && (
                <>
                  <div className="flex gap-2">
                    <Badge variant="success">{preview.filter((p) => p.ok).length} baris valid</Badge>
                    <Badge variant="danger">{preview.filter((p) => !p.ok).length} baris ditolak</Badge>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto mile-scroll rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Baris</TableHead>
                          <TableHead>Kode</TableHead>
                          <TableHead>Nama</TableHead>
                          <TableHead>Validasi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.map((p) => (
                          <TableRow key={p.row} className={p.ok ? "" : "bg-[#FAE5E7]/50"}>
                            <TableCell>{p.row}</TableCell>
                            <TableCell className="font-mono text-xs">{p.key}</TableCell>
                            <TableCell>{p.name}</TableCell>
                            <TableCell className="text-xs">
                              <span className={cn("flex items-center gap-1", p.ok ? "text-[#198754]" : "font-semibold text-[#BF2130]")}>
                                {p.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {p.msg}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground">Baris ditolak dapat diunduh sebagai laporan, diperbaiki, lalu di-import ulang.</p>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>
              Batal
            </Button>
            {dlg?.stage !== "preview" ? (
              <Button disabled={!dlg?.file || dlg?.stage === "validating"} onClick={validate}>
                Validasi
              </Button>
            ) : (
              <Button
                onClick={() => {
                  const ok = preview.filter((p) => p.ok).length;
                  const bad = preview.length - ok;
                  setImportLogs((l) => [{ id: `L${Date.now()}`, kind: "Import", template: tplName(dlg.template), file: dlg.file!, by: user!.name, at: nowStamp(), accepted: ok, rejected: bad }, ...l]);
                  toast({ tone: "success", title: "Import selesai", desc: `${ok} baris diterima, ${bad} ditolak · tercatat di riwayat` });
                  setDlg(null);
                }}
              >
                Import {preview.filter((p) => p.ok).length} baris valid
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
