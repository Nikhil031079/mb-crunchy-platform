import { useState } from "react";
import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  User,
  Package,
  MapPin,
  Heart,
  Star,
  Menu,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: ROUTES.ACCOUNT.ROOT, icon: LayoutDashboard },
  { label: "Profile", href: ROUTES.ACCOUNT.PROFILE, icon: User },
  { label: "Orders", href: ROUTES.ACCOUNT.ORDERS, icon: Package },
  { label: "Addresses", href: ROUTES.ACCOUNT.ADDRESSES, icon: MapPin },
  { label: "Favourites", href: ROUTES.ACCOUNT.FAVOURITES, icon: Heart },
  { label: "Loyalty", href: ROUTES.ACCOUNT.LOYALTY, icon: Star },
];

export function AccountSidebar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === ROUTES.ACCOUNT.ROOT) {
      return location.pathname === ROUTES.ACCOUNT.ROOT;
    }
    return location.pathname.startsWith(href);
  };

  const navContent = (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive(item.href)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="lg:hidden mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="gap-2"
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          Menu
        </Button>
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden mb-6 rounded-xl border border-border/60 bg-card p-4">
          {navContent}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:block rounded-xl border border-border/60 bg-card p-4">
        {navContent}
      </aside>
    </>
  );
}
