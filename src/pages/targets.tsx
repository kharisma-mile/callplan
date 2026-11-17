import { useState } from "react";
import { Copy, Save } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApp, branchOf, salesOf } from "@/store/app-store";
import { BRANCHES, CURRENT_MONTH, PRODUCTS } from "@/data/mock";
import { ROLE_META } from "@/lib/rbac";
import { fmtMonth, pct, rupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

type Dim = "sales" | "branch" | "product";
const MONTHS = ["2026-10", "2026-11", "2026-12"];

export function TargetsPage() {
  const { targets, setTargets, inScope, user, can, toast } = useApp();
  const [dim, setDim] = useState<Dim>("sales");
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [dirty, setDirty] = useState(false);
  const scopeAll = ROLE_META[user!.role].scope === "all";
  const editable = can("update_target") && month >= CURRENT_MONTH;

  const rows = targets[dim].filter((t) => {
    if (t.month !== month) return false;
    if (dim === "sales") return inScope(t.key);
    if (dim === "branch") return scopeAll || t.key === user!.branchId;
    return true;
  });
  const label = (key: string) =>
    dim === "sales"
      ? { name: salesOf(key).name, sub: branchOf(salesOf(key).branchId).name }
      : dim === "branch"
        ? { name: BRANCHES.find((b) => b.id === key)!.name, sub: BRANCHES.find((b) => b.id === key)!.city }
        : { name: PRODUCTS.find((p) => p.id === key)!.name, sub: PRODUCTS.find((p) => p.id === key)!.sku };

  const totalT = rows.reduce((a, r) => a + r.target, 0);
  const totalA = rows.reduce((a, r) => a + r.actual, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Target"
        subtitle="Target penjualan per sales, cabang dan produk per bulan. Aktual dihitung dari pesanan yang dikonfirmasi."
        action={
          <>
            {can("create_target") && month > CURRENT_MONTH && (
              <Button
                variant="outline"
                onClick={() => {
                  setTargets((t) => ({
                    ...t,
                    [dim]: t[dim].map((r) => {
                      if (r.month !== month) return r;
                      const prev = t[dim].find((x) => x.key === r.key && x.month === CURRENT_MONTH);
                      return prev ? { ...r, target: prev.target } : r;
                    }),
                  }));
                  toast({ tone: "success", title: "Target disalin", desc: `Dari ${fmtMonth(CURRENT_MONTH)} ke ${fmtMonth(month)}` });
                }}
              >
                <Copy /> Salin dari bulan ini
              </Button>
            )}
            {editable && (
              <Button
                disabled={!dirty}
                onClick={() => {
                  setDirty(false);
                  toast({ tone: "success", title: "Target disimpan", desc: `${fmtMonth(month)} · ${rows.length} baris` });
                }}
              >
                <Save /> Simpan
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 rounded-md bg-muted p-1">
          {(
            [
              ["sales", "Per Sales"],
              ["branch", "Per Cabang"],
              ["product", "Per Produk"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setDim(k)} className={cn("h-[30px] rounded-sm px-3 text-sm font-medium", dim === k ? "bg-background text-primary shadow-sm" : "text-muted-foreground")}>
              {l}
            </button>
          ))}
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-[200px] bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m) => (
              <SelectItem key={m} value={m}>
                {fmtMonth(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!editable && <Badge variant="neutral">{month < CURRENT_MONTH ? "Bulan sudah tutup (read-only)" : "Read-only: butuh update_target"}</Badge>}
        <span className="ml-auto text-sm text-muted-foreground">
          Total target <b className="text-foreground">{rupiah(totalT)}</b> · aktual <b className="text-foreground">{rupiah(totalA)}</b> ({pct(totalA, totalT)}%)
        </span>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No.</TableHead>
              <TableHead>{dim === "sales" ? "Sales" : dim === "branch" ? "Cabang" : "Produk"}</TableHead>
              <TableHead className="w-[220px] text-right">Target (Rp)</TableHead>
              <TableHead className="text-right">Aktual</TableHead>
              <TableHead className="w-[240px]">Pencapaian</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const l = label(r.key);
              const p = pct(r.actual, r.target);
              return (
                <TableRow key={r.key}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-muted-foreground">{l.sub}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {editable ? (
                      <Input
                        type="number"
                        className="h-[31px] text-right"
                        value={r.target}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setDirty(true);
                          setTargets((t) => ({ ...t, [dim]: t[dim].map((x) => (x.key === r.key && x.month === month ? { ...x, target: v } : x)) }));
                        }}
                      />
                    ) : (
                      rupiah(r.target)
                    )}
                  </TableCell>
                  <TableCell className="text-right">{rupiah(r.actual)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#E8E8E8]">
                        <div className={cn("h-full rounded-full", p >= 70 ? "bg-[#198754]" : p >= 50 ? "bg-primary" : "bg-[#FFC105]")} style={{ width: `${Math.min(100, p)}%` }} />
                      </div>
                      <span className="w-10 text-right text-xs font-semibold">{p}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
