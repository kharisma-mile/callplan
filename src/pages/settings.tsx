import { Database, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/switch";
import { useApp } from "@/store/app-store";
import type { Variant } from "@/data/types";
import { cn } from "@/lib/utils";

export function SettingsPage() {
  const { settings, setSettings, can, toast } = useApp();
  const editable = can("update_setting");

  const setVariant = (v: Variant) => {
    if (!editable || v === settings.variant) return;
    setSettings((s) => ({ ...s, variant: v }));
    toast({
      tone: "info",
      title: `Varian ${v} aktif`,
      desc: v === "A" ? "Menu Data → Sinkronisasi Odoo; pesanan dikirim ke Odoo sebagai SO draft." : "Menu Data → Import / Export Excel; status pesanan dikelola di modul.",
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Pengaturan" subtitle="Konfigurasi modul. Preferensi khusus UP dibuat sebagai opsi, bukan perilaku default." action={!editable && <Badge variant="neutral">Read-only: butuh update_setting</Badge>} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Varian solusi</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 md:grid-cols-2">
          {(
            [
              ["A", "Varian A · Integrasi Odoo", "Master data, harga, piutang dari Odoo (sinkron). Pesanan yang dikonfirmasi Sales Admin dibuat sebagai Sales Order draft di Odoo.", Database],
              ["B", "Varian B · Standalone", "Odoo hanya untuk import awal. Data master, pesanan, approval, piutang dan limit kredit dikelola di modul dengan import / export Excel massal.", FileSpreadsheet],
            ] as const
          ).map(([v, title, desc, Icon]) => (
            <button
              key={v}
              disabled={!editable}
              onClick={() => setVariant(v)}
              className={cn(
                "flex gap-4 rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed",
                settings.variant === v ? "border-primary bg-accent ring-2 ring-primary/20" : "border-border hover:border-[#9FE1FE]"
              )}
            >
              <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-md", settings.variant === v ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-xs text-[#4F4F4F]">{desc}</p>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline &amp; approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Approval SPV per perpindahan tahap pipeline</p>
                <p className="text-xs text-muted-foreground">Default mati (praktik umum: approval hanya di NOO). Jika aktif, muncul halaman Approval Tahap Pipeline.</p>
              </div>
              <Switch
                checked={settings.pipelineStageApproval}
                disabled={!editable}
                onChange={(v) => {
                  setSettings((s) => ({ ...s, pipelineStageApproval: v }));
                  toast({ tone: "info", title: v ? "Approval per tahap diaktifkan" : "Approval per tahap dimatikan", desc: v ? "Menu Approval → Tahap Pipeline tersedia" : undefined });
                }}
              />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Pipeline untuk pelanggan lama (produk baru / proyek)</p>
                <p className="text-xs text-muted-foreground">Opsi hibrida. Default pipeline untuk Pelanggan Baru (NOO).</p>
              </div>
              <Switch checked={settings.existingCustomerPipeline} disabled={!editable} onChange={(v) => setSettings((s) => ({ ...s, existingCustomerPipeline: v }))} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Batas piutang jatuh tempo (hari)</p>
                <p className="text-xs text-muted-foreground">Lewat batas ini pesanan wajib Approval Limit Kredit (contoh 30 hari, ditetapkan Finance).</p>
              </div>
              <Input type="number" className="w-24 text-right" disabled={!editable} value={settings.overdueDays} onChange={(e) => setSettings((s) => ({ ...s, overdueDays: Number(e.target.value) }))} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tier LOA diskon</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No.</TableHead>
                <TableHead>Penyetuju</TableHead>
                <TableHead>Rentang diskon</TableHead>
                <TableHead className="w-[140px] text-right">Batas atas (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.loa.map((t, i) => {
                const prev = i === 0 ? 0 : settings.loa[i - 1].max ?? 0;
                return (
                  <TableRow key={t.role}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.max === null ? `> ${prev}%` : i === 0 ? `0–${t.max}% (tanpa approval)` : `> ${prev}% s.d. ${t.max}%`}</TableCell>
                    <TableCell className="text-right">
                      {t.max === null ? (
                        <span className="text-sm text-muted-foreground">di atasnya</span>
                      ) : (
                        <Input
                          type="number"
                          step="0.5"
                          className="h-[31px] text-right"
                          disabled={!editable}
                          value={t.max}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setSettings((s) => ({ ...s, loa: s.loa.map((x, j) => (j === i ? { ...x, max: v } : x)) }));
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="p-4 text-xs text-muted-foreground">Contoh tier (Sales 2%, SPV 5%, BM 10%, CD di atasnya) — angka final ditetapkan UP. Perubahan berlaku untuk permintaan diskon baru.</p>
        </Card>
      </div>
    </div>
  );
}
