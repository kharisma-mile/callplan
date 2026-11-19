import {
  BadgePercent,
  BarChart3,
  Boxes,
  MapPinned,
  CalendarRange,
  ClipboardCheck,
  Database,
  GitBranch,
  LayoutDashboard,
  PackageCheck,
  Settings,
  ShieldCheck,
  Store,
  Target,
  UserPlus,
  Workflow,
  type LucideIcon,
  Users2,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/app-store";
import type { ApprovalType } from "@/data/types";
import { APPROVAL_META, REQUEST_PAGES, type RequestPage } from "@/lib/rbac";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  perm: string | string[];
  group: "Dashboard" | "Master" | "Sales Operation" | "Request" | "Report";
  /** Request page: badge counts pending requests of these types the user can act on. */
  requests?: ApprovalType[];
}

export const REPORT_PERMS = [
  "visit_report",
  "call_compliance_report",
  "order_report",
  "approval_log",
  "noo_report",
  "pipeline_report",
  "survey_report",
  "target_achievement_report",
  "outlet_report",
  "adoption",
].map((r) => `view_any_${r}`);

/** D-52 navigation: Dashboard · Master · Sales Operation · Request · Report (admin-only items gated by permission). */
export function useNav(): NavItem[] {
  const { settings } = useApp();
  const req = (page: RequestPage) => REQUEST_PAGES[page].types;
  const reqPerm = (page: RequestPage) => req(page).map((t) => `view_any_${APPROVAL_META[t].resource}`);
  return [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "view_any_dashboard", group: "Dashboard" },
    { key: "outlets", label: "Outlet / Pelanggan", icon: Store, perm: "view_any_outlet", group: "Master" },
    { key: "products", label: "Produk & Price List", icon: Boxes, perm: ["view_any_product", "view_any_price_list"], group: "Master" },
    { key: "assortment", label: "Assortment Produk", icon: ListChecks, perm: "view_any_assortment", group: "Master" },
    { key: "territory", label: "Territory & Tim Sales", icon: MapPinned, perm: ["view_any_branch", "view_any_region", "view_any_route", "view_any_sales_team"], group: "Master" },
    { key: "data", label: settings.variant === "A" ? "Sinkronisasi Odoo" : "Import / Export Excel", icon: Database, perm: "view_any_data", group: "Master" },
    { key: "users", label: "Pengguna & Role", icon: ShieldCheck, perm: ["view_any_user", "view_any_role"], group: "Master" },
    { key: "settings", label: "Pengaturan", icon: Settings, perm: "view_any_setting", group: "Master" },
    { key: "pjp", label: "PJP / Call Plan", icon: CalendarRange, perm: "view_any_pjp", group: "Sales Operation" },
    { key: "plotting", label: "Plotting Pelanggan", icon: Users2, perm: "view_any_outlet_assignment", group: "Sales Operation" },
    { key: "pipeline", label: "Pipeline", icon: GitBranch, perm: "view_any_opportunity", group: "Sales Operation" },
    { key: "orders", label: "Review Pesanan", icon: PackageCheck, perm: "view_any_order", group: "Sales Operation" },
    { key: "targets", label: "Target", icon: Target, perm: "view_any_target", group: "Sales Operation" },
    { key: "request/loa", label: "LOA", icon: BadgePercent, perm: reqPerm("loa"), group: "Request", requests: req("loa") },
    { key: "request/noo", label: "New Customer", icon: UserPlus, perm: reqPerm("noo"), group: "Request", requests: req("noo") },
    { key: "request/pipeline", label: "Pipeline", icon: Workflow, perm: reqPerm("pipeline"), group: "Request", requests: req("pipeline") },
    { key: "reports", label: "Laporan", icon: BarChart3, perm: REPORT_PERMS, group: "Report" },
  ];
}

export function useVisibleNav() {
  const { can } = useApp();
  return useNav().filter((n) => (Array.isArray(n.perm) ? n.perm.some(can) : can(n.perm)));
}

export function AppSidebar({ active, onNavigate }: { active: string; onNavigate: (key: string) => void }) {
  const { approvals, canActOnStep, inScope, settings } = useApp();
  const nav = useVisibleNav();
  const groups = Array.from(new Set(nav.map((n) => n.group)));

  const pendingFor = (types: ApprovalType[]) => approvals.filter((a) => types.includes(a.type) && a.status === "pending" && inScope(a.salesId) && canActOnStep(a)).length;

  return (
    <aside className="flex h-full w-[225px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
          <ClipboardCheck className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-foreground">Sales Operations</p>
          <p className="text-xs text-muted-foreground">PJP &amp; Request · UP</p>
        </div>
      </div>

      <nav className="mile-scroll flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {groups.map((g) => (
          <div key={g} className="pb-1">
            <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
            {nav
              .filter((n) => n.group === g)
              .map((item) => {
                const Icon = item.icon;
                const isActive = active === item.key;
                const count = item.requests ? pendingFor(item.requests) : 0;
                return (
                  <button
                    key={item.key}
                    onClick={() => onNavigate(item.key)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                    <span className="flex-1 truncate text-left">{item.label}</span>
                    {count > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E45C20] px-1.5 text-[11px] font-semibold text-white">{count}</span>
                    )}
                  </button>
                );
              })}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Masuk lewat MileApp
          <br />
          Varian {settings.variant} · {settings.variant === "A" ? "Integrasi Odoo" : "Standalone"} (mode demo)
          <br />
          Mockup demo · data dummy
        </p>
      </div>
    </aside>
  );
}
