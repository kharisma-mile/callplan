import { useEffect, useState } from "react";
import { AppSidebar, useVisibleNav } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { Toaster } from "@/components/toaster";
import { AppProvider, useApp } from "@/store/app-store";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard";
import { PjpPage } from "@/pages/pjp";
import { OutletsPage } from "@/pages/outlets";
import { PipelinePage } from "@/pages/pipeline";
import { ApprovalPage } from "@/pages/approvals";
import { OrdersPage } from "@/pages/orders";
import { TargetsPage } from "@/pages/targets";
import { DataPage } from "@/pages/data";
import { UsersPage } from "@/pages/users";
import { SettingsPage } from "@/pages/settings";
import { ProductsPage } from "@/pages/products";
import { TerritoryPage } from "@/pages/territory";
import { ReportsPage } from "@/pages/reports";
import { PlottingPage } from "@/pages/plotting";
import { AssortmentPage } from "@/pages/assortment";
import { NoAccess } from "@/components/empty-state";
import type { ApprovalType } from "@/data/types";

const readHash = () => window.location.hash.replace(/^#\/?/, "") || "dashboard";

function Shell() {
  const { session } = useApp();
  const nav = useVisibleNav();
  const [route, setRoute] = useState(readHash);

  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const navigate = (key: string) => {
    window.location.hash = `/${key}`;
    setRoute(key);
  };

  // when the role changes (or permissions are revoked) fall back to the first allowed page
  const allowed = nav.some((n) => n.key === route);
  useEffect(() => {
    if (session && !allowed && nav.length) navigate(nav[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId, session?.role, allowed]);

  if (!session) return <LoginPage />;

  let page: JSX.Element;
  if (!allowed) page = <NoAccess perm="(halaman ini)" />;
  else if (route.startsWith("approval/")) page = <ApprovalPage key={route} type={route.split("/")[1] as ApprovalType} />;
  else
    page =
      {
        dashboard: <DashboardPage onNavigate={navigate} />,
        pjp: <PjpPage />,
        outlets: <OutletsPage />,
        pipeline: <PipelinePage />,
        orders: <OrdersPage />,
        targets: <TargetsPage />,
        data: <DataPage />,
        users: <UsersPage />,
        settings: <SettingsPage />,
        products: <ProductsPage />,
        territory: <TerritoryPage />,
        reports: <ReportsPage />,
        plotting: <PlottingPage />,
        assortment: <AssortmentPage />,
      }[route] ?? <DashboardPage onNavigate={navigate} />;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-muted/40">
      <AppSidebar active={route} onNavigate={navigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mile-scroll flex-1 overflow-y-auto p-6">{page}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
      <Toaster />
    </AppProvider>
  );
}
