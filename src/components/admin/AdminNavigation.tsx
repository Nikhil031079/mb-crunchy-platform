import { useState, type ComponentType } from "react";
import { Link } from "react-router";
import {
  BarChart3,
  Building2,
  ChevronDown,
  Clock3,
  Combine,
  FolderTree,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  Package,
  PartyPopper,
  Settings,
  ShoppingCart,
  Tag,
  Truck,
  Users,
  Warehouse,
  Zap,
} from "lucide-react";

import {
  ADMIN_NAVIGATION,
  ROUTES,
  type AdminNavigationIcon,
  type AdminNavigationItem,
} from "@/constants";
import { cn } from "@/lib/utils";

const iconMap: Record<AdminNavigationIcon, ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Building2,
  FolderTree,
  Package,
  Combine,
  PartyPopper,
  Tag,
  ShoppingCart,
  Users,
  Image,
  Settings,
  Warehouse,
  LayoutTemplate,
  Zap,
  Clock3,
  BarChart3,
  Truck,
};

interface AdminNavigationProps {
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}

function isGroupActive(item: AdminNavigationItem, pathname: string): boolean {
  return item.children?.some((child) => child.href === pathname) ?? item.href === pathname;
}

export function AdminNavigation({ pathname, collapsed = false, onNavigate }: AdminNavigationProps) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(() =>
    new Set(ADMIN_NAVIGATION.filter((item) => isGroupActive(item, pathname)).map((item) => item.label)),
  );

  const toggleGroup = (label: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <nav aria-label="Admin navigation" className="space-y-1">
      {ADMIN_NAVIGATION.map((group) => {
        const Icon = iconMap[group.icon];
        const isActive = isGroupActive(group, pathname);
        const isOpen = isActive || openGroups.has(group.label);
        const children = group.children ?? [];

        return (
          <div key={group.label}>
            <button
              type="button"
              onClick={() => toggleGroup(group.label)}
              aria-expanded={isOpen}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                isActive ? "text-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? group.label : undefined}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span className="flex-1">{group.label}</span>}
              {!collapsed && <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />}
            </button>

            {!collapsed && isOpen && (
              <div className="mt-1 space-y-1 border-l border-border/70 pl-3 ml-5">
                {children.map((item) => {
                  const ItemIcon = iconMap[item.icon];
                  const active = item.href === pathname;
                  return (
                    <Link
                      key={item.href}
                      to={item.href ?? ROUTES.ADMIN.ROOT}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      <ItemIcon className="size-3.5 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {collapsed && children.map((item) => {
              const ItemIcon = iconMap[item.icon];
              const active = item.href === pathname;
              return (
                <Link
                  key={item.href}
                  to={item.href ?? ROUTES.ADMIN.ROOT}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  className={cn(
                    "mt-1 flex items-center justify-center rounded-lg p-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <ItemIcon className="size-4" aria-hidden="true" />
                  <span className="sr-only">{item.label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
