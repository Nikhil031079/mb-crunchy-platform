import { Link, useLocation } from "react-router";
import { Home, ShoppingCart, User } from "lucide-react";

import { ROUTES } from "@/constants";
import { cn } from "@/lib/utils";
import { useCart } from "@/stores/cart";
import { useAuth } from "@/hooks/use-auth";

// ============================================================================
// MobileBottomBar — Fixed bottom tab bar for mobile (Blinkit/Zepto style)
// ============================================================================

export function MobileBottomBar() {
  const location = useLocation();
  const { itemCount } = useCart();
  const { isAuthenticated } = useAuth();
  const path = location.pathname;

  const tabs: Array<{
    icon: React.ElementType;
    label: string;
    to: string;
    badge?: number;
  }> = [
    { icon: Home, label: "Home", to: ROUTES.HOME },
    {
      icon: ShoppingCart,
      label: "Cart",
      to: ROUTES.CART,
      badge: itemCount > 0 ? itemCount : undefined,
    },
    {
      icon: User,
      label: isAuthenticated ? "Account" : "Sign In",
      to: isAuthenticated ? ROUTES.ACCOUNT.ROOT : ROUTES.AUTH,
    },
  ];

  const isActive = (to: string) => {
    if (to === ROUTES.HOME) return path === "/";
    return path.startsWith(to);
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
      aria-label="Mobile navigation"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex h-14 max-w-lg items-center justify-around px-2">
        {tabs.map((tab) => {
          const active = isActive(tab.to);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={active ? "page" : undefined}
            >
              <div className="relative">
                <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
                {tab.badge !== undefined && (
                  <span aria-live="polite" className="absolute -right-2 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </div>
              <span className="leading-none">{tab.label}</span>
              {active && (
                <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
