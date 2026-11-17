import {
  BadgePercent,
  CalendarRange,
  ClipboardCheck,
  CreditCard,
  Database,
  FileCheck2,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/app-store";
import type { ApprovalType } from "@/data/types";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  perm: string | string[];
  group: string;
  approval?: ApprovalType;
}

export function useNav(): NavItem[] {
  const { settings } = useApp();
  const items: NavItem[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "view_any_dashboard", group: "Utama" },
    { key: "pjp", label: "PJP / Call Plan", icon: CalendarRange, perm: "view_any_pjp", group: "Sales Operations" },
    { key: "outlets", label: "Outlet / Pelanggan", icon: Store, perm: "view_any_outlet", group: "Sales Operations" },
    { key: "pipeline", label: "Pipeline", icon: GitBranch, perm: "view_any_opportunity", group: "Sales Operations" },
    { key: "orders", label: "Review Pesanan", icon: PackageCheck, perm: "view_any_order", group: "Sales Operations" },
    { key: "targets", label: "Target", icon: Target, perm: "view_any_target", group: "Sales Operations" },
    { key: "approval/discount", label: "Diskon (LOA)", icon: BadgePercent, perm: "view_any_discount", group: "Approval", approval: "discount" },
    { key: "approval/special_order", label: "Pesanan Khusus", icon: FileCheck2, perm: "view_any_special_order", group: "Approval", approval: "special_order" },
    { key: "approval/credit_override", label: "Limit Kredit", icon: CreditCard, perm: "view_any_credit_override", group: "Approval", approval: "credit_override" },
    { key: "approval/noo", label: "Pelanggan Baru (NOO)", icon: UserPlus, perm: "view_any_noo", group: "Approval", approval: "noo" },
  ];
  if (settings.pipelineStageApproval)
    items.push({ key: "approval/pipeline_stage", label: "Tahap Pipeline", icon: Workflow, perm: "view_any_pipeline_stage", group: "Approval", approval: "pipeline_stage" });
  items.push(
    {
      key: "data",
      label: settings.variant === "A" ? "Sinkronisasi Odoo" : "Import / Export Excel",
      icon: Database,
      perm: "view_any_data",
      group: "Administrasi",
    },
    { key: "users", label: "Pengguna & Role", icon: ShieldCheck, perm: ["view_any_user", "view_any_role"], group: "Administrasi" },
    { key: "settings", label: "Pengaturan", icon: Settings, perm: "view_any_setting", group: "Administrasi" }
  );
  return items;
}

export function useVisibleNav() {
  const { can } = useApp();
  return useNav().filter((n) => (Array.isArray(n.perm) ? n.perm.some(can) : can(n.perm)));
}

export function AppSidebar({ active, onNavigate }: { active: string; onNavigate: (key: string) => void }) {
  const { approvals, canActOnStep, inScope, settings } = useApp();
  const nav = useVisibleNav();
  const groups = Array.from(new Set(nav.map((n) => n.group)));

  const pendingFor = (t: ApprovalType) => approvals.filter((a) => a.type === t && a.status === "pending" && inScope(a.salesId) && canActOnStep(a)).length;

  return (
    <aside className="flex h-full w-[225px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
          <ClipboardCheck className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-foreground">Sales Operations</p>
          <p className="text-xs text-muted-foreground">PJP &amp; Approval · UP</p>
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
                const count = item.approval ? pendingFor(item.approval) : 0;
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
          Varian {settings.variant} · {settings.variant === "A" ? "Integrasi Odoo" : "Standalone"}
          <br />
          Mockup demo · data dummy
        </p>
      </div>
    </aside>
  );
}
