import { useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";

import { AdminSidebar, AdminTopbar } from "@/components/admin";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getAdminRouteContext, ROUTES } from "@/constants";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { cn } from "@/lib/utils";

export function AdminLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const location = useLocation();
  const routeContext = getAdminRouteContext(location.pathname);
  const { isAuthenticated, isLoading, hasAdmins, admin, logout } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (hasAdmins === false) {
      return <Navigate to={ROUTES.ADMIN.SETUP} replace />;
    }
    return <Navigate to={ROUTES.ADMIN.LOGIN} replace />;
  }

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <AdminSidebar
        pathname={location.pathname}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 lg:flex",
          sidebarCollapsed ? "w-[76px]" : "w-72",
        )}
      />

      <div
        className={cn(
          "min-h-screen transition-[padding] duration-200 lg:pl-72",
          sidebarCollapsed && "lg:pl-[76px]",
        )}
      >
        <AdminTopbar
          title={routeContext.title}
          group={routeContext.group}
          onOpenMobileNavigation={() => setMobileNavigationOpen(true)}
        />
        <main className="mx-auto w-full max-w-screen-2xl p-4 sm:p-6 lg:p-8">
          <div className="rounded-xl border border-border bg-background p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
        <SheetContent side="left" className="w-80 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Administration navigation</SheetTitle>
          </SheetHeader>
          <AdminSidebar
            pathname={location.pathname}
            collapsed={false}
            onCollapsedChange={() => undefined}
            onNavigate={() => setMobileNavigationOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default AdminLayout;
