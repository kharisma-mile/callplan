import { useState, type ReactNode } from "react";
import { Database, FileSpreadsheet, Lock, Save, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/switch";
import { useApp } from "@/store/app-store";
import type { Frequency, Settings, Variant } from "@/data/types";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Keys = (keyof Settings)[];

const LABELS: Partial<Record<keyof Settings, string>> = {
  pipelineStageApproval: "Approval SPV per tahap pipeline",
  pipelineBatalApproval: "Approval Batal pipeline oleh SPV",
  existingCustomerPipeline: "Pipeline pelanggan lama",
  overdueDays: "Batas piutang jatuh tempo (hari)",
  approvalTrigger: "Pemicu approval pesanan",
  discountTierMode: "Mode tier diskon",
  discountBasis: "Ukuran diskon",
  creditApprover: "Penyetuju limit kredit",
  slaHours: "SLA pengingat approval (jam)",
  loa: "Tier LOA diskon",
  classFreq: "Frekuensi per kelas",
  belumBeliFreq: "Frekuensi Pelanggan Lama – belum beli",
  spvEditPjpDirect: "SPV edit PJP langsung",
  salesAdminReview: "Review Sales Admin",
  orderWithoutVisitHQ: "Pesanan tanpa kunjungan (HQ Direct Sales)",
  nooOrderBeforeFinance: "Pesanan pertama NOO sebelum approval Finance",
  minOrder: "Minimum order per customer group",
  geofenceM: "Radius geofence (m)",
};

const show = (v: unknown) => (typeof v === "boolean" ? (v ? "aktif" : "mati") : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Module 13 P-02: each card keeps a draft and saves with its own Simpan button. */
function SettingsCard({
  title,
  keys,
  children,
  validate,
  className,
}: {
  title: string;
  keys: Keys;
  children: (d: Settings, set: (p: Partial<Settings>) => void, editable: boolean) => ReactNode;
  validate?: (d: Settings) => string | null;
  className?: string;
}) {
  const { settings, setSettings, can, toast, addAudit } = useApp();
  const editable = can("update_setting");
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const merged = { ...settings, ...draft } as Settings;
  const changed = keys.filter((k) => k in draft && JSON.stringify(draft[k]) !== JSON.stringify(settings[k]));
  const error = validate?.(merged) ?? null;

  const save = () => {
    setSettings((s) => ({ ...s, ...draft }));
    changed.forEach((k) =>
      addAudit({ module: "Pengaturan", action: "Pengaturan disimpan", target: LABELS[k] ?? k, detail: k === "loa" ? merged.loa.map((t) => `${t.label} ${t.max ?? "∞"}`).join(", ") : `${show(settings[k])} → ${show(merged[k])}` })
    );
    setDraft({});
    toast({ tone: "success", title: `${title} disimpan`, desc: "Perubahan berlaku untuk permintaan / dokumen baru." });
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">{title}</CardTitle>
        {editable && (
          <div className="flex items-center gap-2">
            {changed.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setDraft({})}>
                Batal
              </Button>
            )}
            <Button size="sm" disabled={!changed.length || !!error} onClick={save}>
              <Save /> Simpan
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {children(merged, (p) => setDraft((d) => ({ ...d, ...p })), editable)}
        {error && (
          <p className="flex items-center gap-1 text-xs text-[#BF2130]">
            <TriangleAlert className="h-3.5 w-3.5" /> {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Pick<T extends string>({ value, onChange, options, disabled, w = "w-[220px]" }: { value: T; onChange: (v: T) => void; options: [T, string][]; disabled?: boolean; w?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <SelectTrigger className={w}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([k, l]) => (
          <SelectItem key={k} value={k}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const FREQ: [Frequency, string][] = [
  ["F4", "F4 · tiap minggu"],
  ["F2", "F2 · 2 minggu sekali"],
  ["F1", "F1 · sebulan sekali"],
];

export function SettingsPage() {
  const { settings, setSettings, can, toast, auditLog } = useApp();
  const editable = can("update_setting");

  const setVariant = (v: Variant) => {
    if (!editable || v === settings.variant) return;
    setSettings((s) => ({ ...s, variant: v }));
    toast({
      tone: "info",
      title: `Varian ${v} aktif (mode demo)`,
      desc: v === "A" ? "Menu Data → Sinkronisasi Odoo; pesanan dikirim ke Odoo sebagai SO draft." : "Menu Data → Import / Export Excel; status pesanan dikelola di modul.",
    });
  };
  const history = auditLog.filter((e) => e.module === "Pengaturan").slice(0, 10);
  const creditLabel = settings.creditApprover === "finance" ? "Finance" : settings.creditApprover === "bm" ? "Branch Manager" : "Finance atau Branch Manager (salah satu cukup)";

  return (
    <div className="space-y-6">
      <PageHeader title="Pengaturan" subtitle="Konfigurasi modul. Preferensi khusus UP dibuat sebagai opsi, bukan perilaku default. Setiap kartu disimpan dengan tombol Simpan." action={!editable && <Badge variant="neutral">Read-only: butuh update_setting</Badge>} />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Varian solusi
            <Badge variant="warning">Mode demo — di produksi varian ditetapkan saat deployment</Badge>
          </CardTitle>
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
          <p className="text-xs text-muted-foreground md:col-span-2">Klik kartu hanya untuk simulasi demo. Di produk halaman ini read-only; perpindahan B → A adalah proyek upgrade.</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsCard
          title="Pipeline & approval"
          keys={["pipelineBatalApproval", "pipelineStageApproval", "existingCustomerPipeline", "overdueDays"]}
          validate={(d) => (d.overdueDays < 0 || d.overdueDays > 365 ? "Batas hari harus antara 0 dan 365." : null)}
        >
          {(d, set, ed) => (
            <>
              <Row title="Approval Batal pipeline oleh SPV" hint="Default aktif (AS-15). Peluang tetap di tahapnya sampai SPV memutuskan di Approval Tahap Pipeline.">
                <Switch checked={d.pipelineBatalApproval} disabled={!ed} onChange={(v) => set({ pipelineBatalApproval: v })} />
              </Row>
              <Row title="Approval SPV per perpindahan tahap pipeline" hint="Default mati. Jika aktif, setiap perpindahan tahap menunggu approval SPV.">
                <Switch checked={d.pipelineStageApproval} disabled={!ed} onChange={(v) => set({ pipelineStageApproval: v })} />
              </Row>
              <Row title="Pipeline untuk pelanggan lama (produk baru / proyek)" hint="Opsi hibrida, default mati (AS-14). Default pipeline hanya untuk Pelanggan Baru (NOO).">
                <Switch checked={d.existingCustomerPipeline} disabled={!ed} onChange={(v) => set({ existingCustomerPipeline: v })} />
              </Row>
              <Row title="Batas piutang jatuh tempo (hari)" hint="Lewat batas ini pesanan wajib Approval Limit Kredit (contoh 30 hari, ditetapkan Finance).">
                <Input type="number" className="w-24 text-right" disabled={!ed} value={d.overdueDays} onChange={(e) => set({ overdueDays: Number(e.target.value) })} />
              </Row>
            </>
          )}
        </SettingsCard>

        <SettingsCard
          title="Approval pesanan"
          keys={["approvalTrigger", "discountTierMode", "discountBasis", "creditApprover", "slaHours"]}
          validate={(d) => (d.slaHours < 1 || d.slaHours > 168 ? "SLA harus antara 1 dan 168 jam." : null)}
        >
          {(d, set, ed) => (
            <>
              <Row title="Pemicu approval" hint="Otomatis (default PRD): request dibuat saat pesanan masuk, sebelum review Sales Admin. Manual: Sales Admin menekan Ajukan approval.">
                <Pick value={d.approvalTrigger} disabled={!ed} onChange={(v) => set({ approvalTrigger: v })} options={[["auto", "Otomatis saat pesanan masuk"], ["manual", "Oleh Sales Admin"]]} />
              </Row>
              <Row title="Mode tier diskon" hint="Default: langsung ke satu tier yang mencakup besar diskon (atasan boleh memutuskan).">
                <Pick value={d.discountTierMode} disabled={!ed} onChange={(v) => set({ discountTierMode: v })} options={[["single", "Satu tier yang mencakup"], ["sequential", "Berurutan setiap tier"]]} />
              </Row>
              <Row title="Ukuran diskon" hint="Dasar perbandingan dengan tier LOA.">
                <Pick value={d.discountBasis} disabled={!ed} onChange={(v) => set({ discountBasis: v })} options={[["order", "Rata-rata tertimbang pesanan"], ["line", "Maksimum per baris"]]} />
              </Row>
              <Row title="Penyetuju limit kredit" hint="AS-21: Finance atau Branch Manager.">
                <Pick value={d.creditApprover} disabled={!ed} onChange={(v) => set({ creditApprover: v })} options={[["finance_or_bm", "Finance atau BM"], ["finance", "Finance saja"], ["bm", "Branch Manager saja"]]} />
              </Row>
              <Row title="SLA pengingat approval (jam)" hint="Request pending melewati SLA ditandai 'Lewat SLA' dan penyetuju diingatkan. Tanpa auto-approve.">
                <Input type="number" className="w-24 text-right" disabled={!ed} value={d.slaHours} onChange={(e) => set({ slaHours: Number(e.target.value) })} />
              </Row>
            </>
          )}
        </SettingsCard>

        <SettingsCard
          title="Tier LOA diskon"
          keys={["loa"]}
          validate={(d) => {
            for (let i = 1; i < d.loa.length; i++) {
              const prev = d.loa[i - 1].max ?? 0;
              const cur = d.loa[i].max;
              if (cur !== null && cur <= prev) return `Batas atas harus lebih besar dari tier sebelumnya (${prev}%).`;
            }
            return null;
          }}
        >
          {(d, set, ed) => (
            <>
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
                  {d.loa.map((t, i) => {
                    const prev = i === 0 ? 0 : d.loa[i - 1].max ?? 0;
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
                              disabled={!ed}
                              value={t.max}
                              onChange={(e) => set({ loa: d.loa.map((x, j) => (j === i ? { ...x, max: Number(e.target.value) } : x)) })}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">Contoh tier (Sales 2%, SPV 5%, BM 10%, CD di atasnya) — angka final ditetapkan UP. Perubahan berlaku untuk permintaan diskon baru.</p>
            </>
          )}
        </SettingsCard>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Rantai approval <Badge variant="neutral"><Lock className="mr-1 h-3 w-3" /> read-only · diubah lewat konfigurasi deployment</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">No.</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Langkah</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["Diskon (LOA)", settings.discountTierMode === "single" ? "1 langkah: tier yang mencakup (SPV / BM / CD)" : "Berurutan: SPV → BM → CD sampai tier yang mencakup"],
                  ["Pesanan Khusus", "Branch Manager → Commercial Director"],
                  ["Kelonggaran Limit Kredit", creditLabel],
                  ["Pelanggan Baru (NOO)", "Sales SPV (verifikasi data) → Finance (limit kredit, TOP, price group)"],
                  ["Tahap Pipeline", settings.pipelineStageApproval ? "Sales SPV untuk setiap perpindahan tahap" : settings.pipelineBatalApproval ? "Sales SPV untuk Batal" : "Tidak aktif"],
                ].map(([k, v], i) => (
                  <TableRow key={k}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{k}</TableCell>
                    <TableCell className="text-sm">{v}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <SettingsCard title="PJP / call plan" keys={["classFreq", "belumBeliFreq", "spvEditPjpDirect"]}>
          {(d, set, ed) => (
            <>
              {(["A", "B", "C"] as const).map((c) => (
                <Row key={c} title={`Kelas ${c}`} hint="Frekuensi kunjungan default saat outlet masuk PJP (berlaku mulai generate PJP berikutnya).">
                  <Pick value={d.classFreq[c]} disabled={!ed} onChange={(v) => set({ classFreq: { ...d.classFreq, [c]: v } })} options={FREQ} />
                </Row>
              ))}
              <Row title="Pelanggan Lama – belum beli" hint="Frekuensi khusus untuk outlet yang belum pernah beli (AS-16).">
                <Pick value={d.belumBeliFreq} disabled={!ed} onChange={(v) => set({ belumBeliFreq: v })} options={FREQ} />
              </Row>
              <Row title="SPV boleh mengubah PJP langsung" hint="Selain menyetujui permintaan perubahan dari sales (update_pjp).">
                <Switch checked={d.spvEditPjpDirect} disabled={!ed} onChange={(v) => set({ spvEditPjpDirect: v })} />
              </Row>
            </>
          )}
        </SettingsCard>

        <SettingsCard
          title="Opsi default lain"
          keys={["salesAdminReview", "orderWithoutVisitHQ", "nooOrderBeforeFinance", "minOrder", "geofenceM"]}
          validate={(d) => (d.geofenceM < 10 || d.geofenceM > 1000 ? "Radius harus antara 10 dan 1000 meter." : null)}
        >
          {(d, set, ed) => (
            <>
              <Row title="Review Sales Admin sebelum hand-off" hint="Default aktif (AS-20). Mati = pesanan yang lolos cek / approved langsung diteruskan.">
                <Switch checked={d.salesAdminReview} disabled={!ed} onChange={(v) => set({ salesAdminReview: v })} />
              </Row>
              <Row title="Pesanan tanpa kunjungan" hint="Default aktif untuk HQ Direct Sales, mati untuk cabang.">
                <Switch checked={d.orderWithoutVisitHQ} disabled={!ed} onChange={(v) => set({ orderWithoutVisitHQ: v })} />
              </Row>
              <Row title="Izinkan pesanan pertama NOO sebelum approval Finance" hint="Default mati.">
                <Switch checked={d.nooOrderBeforeFinance} disabled={!ed} onChange={(v) => set({ nooOrderBeforeFinance: v })} />
              </Row>
              <Row title="Minimum nilai / qty pesanan per customer group" hint="Default mati.">
                <Switch checked={d.minOrder} disabled={!ed} onChange={(v) => set({ minOrder: v })} />
              </Row>
              <Row title="Radius geofence check-in (m)" hint="Flag, bukan blok. Default 100 m.">
                <Input type="number" className="w-24 text-right" disabled={!ed} value={d.geofenceM} onChange={(e) => set({ geofenceM: Number(e.target.value) })} />
              </Row>
            </>
          )}
        </SettingsCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Riwayat perubahan (10 terakhir)</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No.</TableHead>
              <TableHead>Waktu</TableHead>
              <TableHead>Pengguna</TableHead>
              <TableHead>Parameter</TableHead>
              <TableHead>Nilai lama → baru</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((h, i) => (
              <TableRow key={i}>
                <TableCell>{i + 1}</TableCell>
                <TableCell className="text-xs">{fmtDate(h.at)}</TableCell>
                <TableCell>{h.by}</TableCell>
                <TableCell>{h.target}</TableCell>
                <TableCell className="text-xs">{h.detail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
