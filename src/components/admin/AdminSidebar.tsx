import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { AdminBrand } from "./AdminBrand";
import { AdminNavigation } from "./AdminNavigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
  pathname: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onNavigate?: () => void;
  className?: string;
}

export function AdminSidebar({
  pathname,
  collapsed,
  onCollapsedChange,
  onNavigate,
  className,
}: AdminSidebarProps) {
  return (
    <aside className={cn("flex h-full flex-col border-r border-border bg-background", className)}>
      <div className="flex h-16 items-center border-b border-border px-3">
        <AdminBrand compact={collapsed} className="flex-1" />
        {!collapsed && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onCollapsedChange(true)}
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <AdminNavigation pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      {collapsed && (
        <div className="border-t border-border p-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="w-full"
            onClick={() => onCollapsedChange(false)}
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        </div>
      )}
    </aside>
  );
}
