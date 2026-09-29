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
  { label: "Privacy", href: ROUTES.POLICY.PRIVACY, icon: User },
  { label: "Terms", href: ROUTES.POLICY.TERMS, icon: User },
  { label: "Shipping", href: ROUTES.POLICY.SHIPPING, icon: MapPin },
  { label: "Refunds", href: ROUTES.POLICY.REFUND, icon: X },
  { label: "Help", href: ROUTES.POLICY.HELP, icon: Menu },
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
    <nav className="space-y-1" aria-label="Account">
      <p className="font-culinary-heading px-3 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Account
      </p>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-culinary-primary/10 font-semibold text-culinary-primary-deep dark:text-culinary-primary"
                : "font-medium text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {active && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-culinary-primary"
                aria-hidden="true"
              />
            )}
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
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          Menu
        </Button>
      </div>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden mb-6 rounded-2xl glass-tier-1 p-2 sm:p-3">
          {navContent}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:block rounded-2xl glass-tier-1 p-2 sm:p-3">
        {navContent}
      </aside>
    </>
  );
}
