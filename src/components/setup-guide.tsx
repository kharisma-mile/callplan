import { CheckCircle2, ChevronRight, CircleAlert, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useApp } from "@/store/app-store";
import { SALESMEN, SEGMENT_LIST } from "@/data/mock";
import { cn } from "@/lib/utils";

/**
 * Module 10 — "Alur Setup Sales Operations": the order in which the module is set up, with live status per step.
 * Doubles as the go-live readiness checklist during implementation.
 */
export function SetupGuide({ onNavigate }: { onNavigate: (k: string) => void }) {
  const { routes, outlets, assortments, priceLists, pjpHeaders, scopeSalesIds, can } = useApp();
  const scopeSales = SALESMEN.filter((s) => scopeSalesIds.includes(s.id));
  const noRoute = scopeSales.filter((s) => !routes.some((r) => r.active && r.salesId === s.id)).length;
  const unplotted = outlets.filter((o) => o.active && scopeSalesIds.includes(o.salesId) && !o.routeId).length;
  const missingAssort = SEGMENT_LIST.filter((seg) => !assortments.some((a) => a.segment === seg)).length;
  const notPublished = pjpHeaders.filter((h) => scopeSalesIds.includes(h.salesId) && h.status !== "Dipublikasikan").length;
  const published = scopeSales.length - notPublished;

  const steps = [
    { key: "territory", perm: ["view_any_route", "view_any_sales_team"], title: "Territory & Tim Sales", desc: "Cabang, SPV → salesman, rute / beat per hari", todo: noRoute, todoText: `${noRoute} salesman belum punya rute`, okText: `${routes.filter((r) => r.active).length} rute aktif` },
    { key: "plotting", perm: ["view_any_outlet_assignment"], title: "Plotting Pelanggan", desc: "Outlet → salesman pemilik + rute", todo: unplotted, todoText: `${unplotted} outlet belum diplot ke rute`, okText: "Semua outlet sudah diplot" },
    { key: "assortment", perm: ["view_any_assortment", "view_any_price_list"], title: "Produk, Price List & Assortment", desc: "Harga per price group, produk per segmen", todo: missingAssort, todoText: `${missingAssort} segmen tanpa assortment`, okText: `${priceLists.filter((p) => p.active).length} price list aktif` },
    { key: "pjp", perm: ["view_any_pjp"], title: "PJP / Call Plan", desc: "Generate → approval → publikasi", todo: notPublished, todoText: `${notPublished} salesman PJP belum dipublikasikan`, okText: "Semua PJP dipublikasikan" },
  ];
  const visible = steps.filter((s) => s.perm.some((p) => can(p)));
  if (!visible.length) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Alur Setup Sales Operations</h3>
          <span className="text-xs text-muted-foreground">Urutan kerja · juga checklist kesiapan go-live</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {visible.map((s, i) => (
            <button key={s.key} onClick={() => onNavigate(s.key)} className="group flex flex-col rounded-lg border p-3 text-left transition-colors hover:border-primary">
              <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">{steps.indexOf(s) + 1}</span>
                Langkah {steps.indexOf(s) + 1}
                <ChevronRight className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-1.5 text-sm font-semibold">{s.title}</span>
              <span className="text-xs text-muted-foreground">{s.desc}</span>
              <span className={cn("mt-2 flex items-center gap-1 text-xs font-medium", s.todo ? "text-[#8D6100]" : "text-[#115A38]")}>
                {s.todo ? <CircleAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {s.todo ? s.todoText : s.okText}
              </span>
            </button>
          ))}
          <div className="flex flex-col rounded-lg border border-dashed p-3">
            <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[#115A38] text-[11px] text-white">5</span> Langkah 5
            </span>
            <span className="mt-1.5 flex items-center gap-1 text-sm font-semibold"><Smartphone className="h-4 w-4" /> Eksekusi di Mile Field</span>
            <span className="text-xs text-muted-foreground">Task kunjungan dibuat otomatis tiap pagi dari PJP yang dipublikasikan</span>
            <span className="mt-2 text-xs font-medium text-[#115A38]">{published} salesman menerima task kunjungan</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
