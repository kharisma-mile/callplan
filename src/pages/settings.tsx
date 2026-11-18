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
import { BRANCHES, HOLIDAYS } from "@/data/mock";
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
  pjpApprover: "Penyetuju PJP (sebelum publish)",
  pjpCallTarget: "Target call per hari",
  pjpMaxCalls: "Maksimum call per hari",
  hqCallTarget: "Target call per hari (HQ)",
  hqMaxCalls: "Maksimum call per hari (HQ)",
  classVisitMinutes: "Durasi kunjungan per kelas",
  travelMinutes: "Perjalanan antar outlet (menit)",
  cycleWeeks: "Panjang siklus PJP",
  workDays: "Hari kerja",
  branchWorkDays: "Hari kerja per cabang",
  geofenceMode: "Mode geofence",
  photoRequired: "Foto check-in wajib",
  minVisitMinutes: "Durasi kunjungan minimum",
  checkoutRequired: "Check-out wajib",
  extraCallAllowed: "Extra call diizinkan",
  extraCallNeedsReason: "Extra call wajib alasan",
  extraInCompliance: "Extra call masuk compliance",
  skipReasons: "Alasan skip",
  carryOverMode: "Carry-over",
  carryOverMaxDays: "Carry-over maks hari",
  publishCutoff: "Batas publish (H-1)",
  lockAfterPublish: "Kunci PJP setelah publish",
  changeApprover: "Penyetuju perubahan PJP",
  changeRequestSlaHours: "SLA permintaan perubahan",
  generateBalanceBy: "Generate: dasar penyeimbangan",
  generateKeepRoute: "Generate: pertahankan rute",
  routeStartPoint: "Titik awal rute",
  reminderTime: "Jam pengingat call plan",
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
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-[200px]">
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

const DAY_S = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
function DayToggles({ value, onChange, disabled }: { value: number[]; onChange: (v: number[]) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {DAY_S.map((d, i) => (
        <button
          key={d}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort((a, b) => a - b))}
          className={cn("h-7 w-9 rounded-sm text-[11px] font-semibold", value.includes(i) ? "bg-primary text-white" : "bg-muted text-muted-foreground")}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
function BranchDays({ value, fallback, onChange, disabled }: { value: Record<string, number[]>; fallback: number[]; onChange: (v: Record<string, number[]>) => void; disabled?: boolean }) {
  const [b, setB] = useState("HQ");
  const cur = value[b];
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Pick value={b} onChange={setB} options={BRANCHES.map((x) => [x.id, x.name] as [string, string])} w="w-[170px]" />
        {cur && !disabled && (
          <button
            type="button"
            className="text-xs text-primary underline"
            onClick={() => {
              const n = { ...value };
              delete n[b];
              onChange(n);
            }}
          >
            Ikut default
          </button>
        )}
      </div>
      <DayToggles value={cur ?? fallback} disabled={disabled} onChange={(v) => onChange({ ...value, [b]: v })} />
      {Object.keys(value).length > 0 && <p className="text-[11px] text-muted-foreground">Override: {Object.entries(value).map(([k, v]) => `${k} (${v.map((x) => DAY_S[x]).join(", ")})`).join("; ")}</p>}
    </div>
  );
}
function AddReason({ onAdd }: { onAdd: (r: string) => void }) {
  const [v, setV] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <Input className="h-6 w-36 text-xs" placeholder="Alasan baru" value={v} onChange={(e) => setV(e.target.value)} />
      <button type="button" className="text-xs text-primary" disabled={!v.trim()} onClick={() => { onAdd(v.trim()); setV(""); }}>
        + Tambah
      </button>
    </span>
  );
}

const FREQ: [Frequency, string][] = [
  ["F12", "F12 · 3×/minggu"],
  ["F8", "F8 · 2×/minggu"],
  ["F4", "F4 · tiap minggu"],
  ["F2", "F2 · 2 minggu sekali"],
  ["F1", "F1 · 1×/4 minggu"],
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

        <SettingsCard
          title="PJP / call plan"
          className="xl:col-span-2"
          keys={["cycleWeeks", "workDays", "branchWorkDays", "classFreq", "belumBeliFreq", "pjpCallTarget", "pjpMaxCalls", "hqCallTarget", "hqMaxCalls", "classVisitMinutes", "travelMinutes", "generateBalanceBy", "generateKeepRoute", "routeStartPoint"]}
          validate={(d) =>
            d.pjpCallTarget < 1 || d.pjpMaxCalls < d.pjpCallTarget || d.hqMaxCalls < d.hqCallTarget
              ? "Maksimum call per hari harus ≥ target call per hari."
              : !d.workDays.length
                ? "Pilih minimal satu hari kerja."
                : null
          }
        >
          {(d, set, ed) => (
            <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Siklus & frekuensi</p>
                <Row title="Panjang siklus PJP" hint="Rotasi 4 minggu (praktik umum SFA); minggu ke-n dihitung dari tanggal acuan siklus.">
                  <Badge variant="neutral">{d.cycleWeeks} minggu (tetap)</Badge>
                </Row>
                <Row title="Hari kerja (default)" hint="Hari yang boleh berisi kunjungan. Override per cabang di bawah.">
                  <DayToggles value={d.workDays} disabled={!ed} onChange={(v) => set({ workDays: v })} />
                </Row>
                <Row title="Override hari kerja per cabang" hint="Contoh: HQ Direct Sales Senin–Jumat. Kosong = ikut default.">
                  <BranchDays value={d.branchWorkDays} fallback={d.workDays} disabled={!ed} onChange={(v) => set({ branchWorkDays: v })} />
                </Row>
                {(["A", "B", "C"] as const).map((c) => (
                  <Row key={c} title={`Frekuensi default kelas ${c}`} hint="Dipakai saat outlet masuk PJP / generate. F8 / F12 dipilih manual per outlet (key account).">
                    <Pick value={d.classFreq[c]} disabled={!ed} onChange={(v) => set({ classFreq: { ...d.classFreq, [c]: v } })} options={FREQ} />
                  </Row>
                ))}
                <Row title="Pelanggan Lama – belum beli" hint="Frekuensi khusus untuk outlet yang belum pernah beli (AS-16).">
                  <Pick value={d.belumBeliFreq} disabled={!ed} onChange={(v) => set({ belumBeliFreq: v })} options={FREQ} />
                </Row>
                <p className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                  F1 = 1×/4 minggu (satu minggu) · F2 = 2×/4 minggu (M1&amp;M3 / M2&amp;M4) · F4 = tiap minggu · F8 = 2×/minggu (2 hari, mis. Sen &amp; Kam) · F12 = 3×/minggu (Sen, Rab, Jum).
                </p>
              </div>
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kapasitas & generate</p>
                <Row title="Target / maks call per hari — sales cabang" hint="B2B plastik 10–15 (FMCG umumnya 20–30). Di atas target kuning, di atas maks merah.">
                  <div className="flex gap-2">
                    <Input type="number" className="w-20 text-right" disabled={!ed} value={d.pjpCallTarget} onChange={(e) => set({ pjpCallTarget: Number(e.target.value) })} />
                    <Input type="number" className="w-20 text-right" disabled={!ed} value={d.pjpMaxCalls} onChange={(e) => set({ pjpMaxCalls: Number(e.target.value) })} />
                  </div>
                </Row>
                <Row title="Target / maks call per hari — HQ key account" hint="Kanal key account: kunjungan lebih lama, call per hari lebih sedikit.">
                  <div className="flex gap-2">
                    <Input type="number" className="w-20 text-right" disabled={!ed} value={d.hqCallTarget} onChange={(e) => set({ hqCallTarget: Number(e.target.value) })} />
                    <Input type="number" className="w-20 text-right" disabled={!ed} value={d.hqMaxCalls} onChange={(e) => set({ hqMaxCalls: Number(e.target.value) })} />
                  </div>
                </Row>
                <Row title="Durasi kunjungan standar A / B / C (menit)" hint="Untuk estimasi durasi hari dan generate berbasis durasi.">
                  <div className="flex gap-2">
                    {(["A", "B", "C"] as const).map((c) => (
                      <Input key={c} type="number" className="w-16 text-right" disabled={!ed} value={d.classVisitMinutes[c]} onChange={(e) => set({ classVisitMinutes: { ...d.classVisitMinutes, [c]: Number(e.target.value) } })} />
                    ))}
                  </div>
                </Row>
                <Row title="Perjalanan antar outlet (menit)">
                  <Input type="number" className="w-20 text-right" disabled={!ed} value={d.travelMinutes} onChange={(e) => set({ travelMinutes: Number(e.target.value) })} />
                </Row>
                <Row title="Generate: seimbangkan berdasarkan" hint="Jumlah call per hari, atau durasi (kelas A dihitung lebih berat).">
                  <Pick value={d.generateBalanceBy} disabled={!ed} onChange={(v) => set({ generateBalanceBy: v })} options={[["count", "Jumlah call"], ["duration", "Durasi kunjungan"]]} w="w-[180px]" />
                </Row>
                <Row title="Generate: pertahankan rute / beat" hint="Outlet tetap di hari rutenya; hanya F1 / F2 yang boleh digeser ke hari tetangga.">
                  <Switch checked={d.generateKeepRoute} disabled={!ed} onChange={(v) => set({ generateKeepRoute: v })} />
                </Row>
                <Row title="Titik awal / akhir rute" hint="Dipakai saat generate otomatis dan estimasi jarak rute.">
                  <Pick value={d.routeStartPoint} disabled={!ed} onChange={(v) => set({ routeStartPoint: v })} options={[["branch", "Kantor cabang"], ["home", "Rumah salesman"]]} w="w-[180px]" />
                </Row>
              </div>
            </div>
          )}
        </SettingsCard>

        <SettingsCard
          title="Kunjungan & eksekusi (Mile Field)"
          keys={["geofenceM", "geofenceMode", "photoRequired", "minVisitMinutes", "checkoutRequired", "extraCallAllowed", "extraCallNeedsReason", "extraInCompliance", "skipReasons", "carryOverMode", "carryOverMaxDays", "reminderTime"]}
          validate={(d) => (d.geofenceM < 10 || d.geofenceM > 1000 ? "Radius harus antara 10 dan 1000 meter." : d.skipReasons.length < 2 ? "Minimal dua alasan skip." : null)}
        >
          {(d, set, ed) => (
            <>
              <Row title="Radius geofence check-in (m)" hint="Default 100 m. Flag = boleh check-in, ditandai di luar radius; Blok = tidak bisa check-in.">
                <div className="flex gap-2">
                  <Input type="number" className="w-20 text-right" disabled={!ed} value={d.geofenceM} onChange={(e) => set({ geofenceM: Number(e.target.value) })} />
                  <Pick value={d.geofenceMode} disabled={!ed} onChange={(v) => set({ geofenceMode: v })} options={[["flag", "Flag"], ["block", "Blok"]]} w="w-[96px]" />
                </div>
              </Row>
              <Row title="Foto check-in wajib" hint="Foto kamera langsung (bukan galeri).">
                <Switch checked={d.photoRequired} disabled={!ed} onChange={(v) => set({ photoRequired: v })} />
              </Row>
              <Row title="Durasi kunjungan minimum (menit)" hint="Di bawah ini kunjungan ditandai, tidak dihitung effective time.">
                <Input type="number" className="w-20 text-right" disabled={!ed} value={d.minVisitMinutes} onChange={(e) => set({ minVisitMinutes: Number(e.target.value) })} />
              </Row>
              <Row title="Check-out wajib" hint="Kunjungan tanpa check-out tidak dihitung selesai (compliance).">
                <Switch checked={d.checkoutRequired} disabled={!ed} onChange={(v) => set({ checkoutRequired: v })} />
              </Row>
              <Row title="Extra call diizinkan / wajib alasan" hint="Kunjungan di luar PJP (follow-up, tak terencana).">
                <div className="flex gap-3">
                  <Switch checked={d.extraCallAllowed} disabled={!ed} onChange={(v) => set({ extraCallAllowed: v })} />
                  <Switch checked={d.extraCallNeedsReason} disabled={!ed || !d.extraCallAllowed} onChange={(v) => set({ extraCallNeedsReason: v })} />
                </div>
              </Row>
              <Row title="Extra call masuk compliance" hint="Default mati: extra call dihitung terpisah, tidak masuk penyebut call compliance.">
                <Switch checked={d.extraInCompliance} disabled={!ed} onChange={(v) => set({ extraInCompliance: v })} />
              </Row>
              <Row title="Carry-over kunjungan dijadwalkan ulang" hint="Manual: sales pilih tanggal; Otomatis: hari kerja berikutnya. Selalu dalam minggu yang sama.">
                <div className="flex gap-2">
                  <Pick value={d.carryOverMode} disabled={!ed} onChange={(v) => set({ carryOverMode: v })} options={[["manual", "Manual"], ["auto", "Otomatis"], ["off", "Nonaktif"]]} w="w-[120px]" />
                  <Input type="number" title="Maks hari" className="w-16 text-right" disabled={!ed || d.carryOverMode === "off"} value={d.carryOverMaxDays} onChange={(e) => set({ carryOverMaxDays: Number(e.target.value) })} />
                </div>
              </Row>
              <Row title="Jam pengingat call plan" hint="Push ke Mile Field: jumlah kunjungan hari ini.">
                <Input type="time" className="w-28" disabled={!ed} value={d.reminderTime} onChange={(e) => set({ reminderTime: e.target.value })} />
              </Row>
              <div className="space-y-1">
                <p className="text-sm font-medium">Master alasan skip</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.skipReasons.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                      {r}
                      {ed && r !== "Lainnya" && (
                        <button className="text-muted-foreground hover:text-[#BF2130]" onClick={() => set({ skipReasons: d.skipReasons.filter((x) => x !== r) })} title="Hapus">
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {ed && <AddReason onAdd={(r) => !d.skipReasons.includes(r) && set({ skipReasons: [...d.skipReasons.filter((x) => x !== "Lainnya"), r, "Lainnya"] })} />}
                </div>
                <p className="text-[11px] text-muted-foreground">"Lainnya" selalu ada dan wajib teks.</p>
              </div>
            </>
          )}
        </SettingsCard>

        <SettingsCard
          title="Publish, kunci & permintaan perubahan PJP"
          keys={["publishCutoff", "lockAfterPublish", "pjpApprover", "spvEditPjpDirect", "changeApprover", "changeRequestSlaHours"]}
        >
          {(d, set, ed) => (
            <>
              <Row title="Batas publish call plan" hint="Publish paling lambat H-1 pada jam ini; bila belum, job malam menerbitkan versi Disetujui terakhir.">
                <div className="flex items-center gap-2 text-sm">
                  H-1 <Input type="time" className="w-28" disabled={!ed} value={d.publishCutoff} onChange={(e) => set({ publishCutoff: e.target.value })} />
                </div>
              </Row>
              <Row title="Kunci PJP setelah publish" hint="Perubahan sesudah publish lewat Permintaan Perubahan.">
                <Switch checked={d.lockAfterPublish} disabled={!ed} onChange={(v) => set({ lockAfterPublish: v })} />
              </Row>
              <Row title="Penyetuju PJP sebelum publish" hint="Draft → Menunggu Approval → Disetujui → Dipublikasikan. Wajib approval sebelum publish. Default BM untuk PJP buatan SPV; Admin selalu dapat memutuskan. Permission approve_pjp.">
                <Pick value={d.pjpApprover} disabled={!ed} onChange={(v) => set({ pjpApprover: v })} options={[["bm", "Branch Manager (default)"], ["spv", "Sales SPV"], ["regional", "Regional Manager (CD)"]]} w="w-[200px]" />
              </Row>
              <Row title="SPV boleh mengubah PJP langsung (bypass approval)" hint="Default MATI. Bila aktif, edit SPV / Admin langsung berstatus Disetujui tanpa approval dan PJP terbit boleh diubah (perlu publish ulang).">
                <Switch checked={d.spvEditPjpDirect} disabled={!ed} onChange={(v) => set({ spvEditPjpDirect: v })} />
              </Row>
              <Row title="Penyetuju permintaan perubahan" hint="Permission update_pjp + cakupan tim / cabang.">
                <Pick value={d.changeApprover} disabled={!ed} onChange={(v) => set({ changeApprover: v })} options={[["spv", "SPV tim"], ["spv_bm", "SPV tim atau BM"]]} w="w-[180px]" />
              </Row>
              <Row title="SLA keputusan (jam)" hint="Lewat SLA ditandai merah di tab Permintaan Perubahan.">
                <Input type="number" className="w-20 text-right" disabled={!ed} value={d.changeRequestSlaHours} onChange={(e) => set({ changeRequestSlaHours: Number(e.target.value) })} />
              </Row>
            </>
          )}
        </SettingsCard>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kalender libur & definisi KPI kunjungan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Libur</TableHead>
                  <TableHead>Berlaku</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {HOLIDAYS.map((h) => (
                  <TableRow key={h.date + h.name}>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(h.date)}</TableCell>
                    <TableCell className="text-xs">{h.name}</TableCell>
                    <TableCell className="text-xs">{h.branchIds ? h.branchIds.join(", ") : "Nasional (semua cabang)"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-[11px] text-muted-foreground">Data contoh. Admin mengisi libur nasional, cuti bersama dan libur daerah per cabang tiap awal tahun (import Excel). Kunjungan di hari libur ditandai di PJP dan diusulkan digeser.</p>
            <dl className="space-y-2 text-xs">
              {[
                ["Call compliance", "Kunjungan rencana selesai (check-in + check-out) ÷ kunjungan rencana. Target ≥ 85%."],
                ["Effective call", "Kunjungan dengan pesanan ÷ kunjungan aktual."],
                ["Strike rate", "Outlet unik yang memesan ÷ outlet unik yang dikunjungi dalam periode."],
                ["Time-in-market", "Check-in pertama s.d. check-out terakhir per hari (jam di pasar)."],
                ["Coverage", "Outlet aktif yang ada di PJP berlaku ÷ outlet aktif."],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
                  <dt className="font-semibold">{k}</dt>
                  <dd className="text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <SettingsCard
          title="Opsi default lain"
          keys={["salesAdminReview", "orderWithoutVisitHQ", "nooOrderBeforeFinance", "minOrder"]}
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
