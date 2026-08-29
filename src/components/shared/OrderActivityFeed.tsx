import {
  BadgeCheck,
  Banknote,
  CheckCircle2,
  Clock,
  CookingPot,
  History,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  MessageSquareX,
  Package,
  PackageCheck,
  PackageOpen,
  RotateCcw,
  Settings2,
  ShoppingBag,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderActivity, OrderActivityAction } from "@/types";
import { formatDateTime } from "@/utils";

// ============================================================================
// Order Activity Feed — shared presentational timeline used by admins and
// customers. Never renders internal notes: the customer query already filters
// visibleToCustomer records, and note actions are hidden by their actor color.
// ============================================================================

interface ActivityMeta {
  label: string;
  icon: LucideIcon;
  color: string;
}

const ACTIVITY_META: Record<OrderActivityAction, ActivityMeta> = {
  order_created: { label: "Order Created", icon: ShoppingBag, color: "bg-blue-500/10 text-blue-600" },
  payment_pending: { label: "Payment Pending", icon: Clock, color: "bg-amber-500/10 text-amber-600" },
  payment_verified: { label: "Payment Verified", icon: BadgeCheck, color: "bg-emerald-500/10 text-emerald-600" },
  payment_failed: { label: "Payment Failed", icon: XCircle, color: "bg-red-500/10 text-red-600" },
  order_accepted: { label: "Order Accepted", icon: CheckCircle2, color: "bg-emerald-500/10 text-emerald-600" },
  preparing: { label: "Preparing", icon: CookingPot, color: "bg-amber-500/10 text-amber-600" },
  ready: { label: "Ready", icon: PackageCheck, color: "bg-emerald-500/10 text-emerald-600" },
  out_for_delivery: { label: "Out for Delivery", icon: Truck, color: "bg-purple-500/10 text-purple-600" },
  delivered: { label: "Delivered", icon: PackageCheck, color: "bg-emerald-500/10 text-emerald-600" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "bg-red-500/10 text-red-600" },
  refund_initiated: { label: "Refund Initiated", icon: RotateCcw, color: "bg-gray-500/10 text-gray-600" },
  refund_completed: { label: "Refund Completed", icon: Banknote, color: "bg-gray-500/10 text-gray-600" },
  manual_status_change: { label: "Manual Status Change", icon: Settings2, color: "bg-indigo-500/10 text-indigo-600" },
  inventory_reserved: { label: "Inventory Reserved", icon: Package, color: "bg-sky-500/10 text-sky-600" },
  inventory_released: { label: "Inventory Released", icon: PackageOpen, color: "bg-sky-500/10 text-sky-600" },
  note_added: { label: "Note Added", icon: MessageSquarePlus, color: "bg-muted text-muted-foreground" },
  note_updated: { label: "Note Updated", icon: MessageSquare, color: "bg-muted text-muted-foreground" },
  note_deleted: { label: "Note Deleted", icon: MessageSquareX, color: "bg-muted text-muted-foreground" },
};

function formatValue(value?: string): string | null {
  if (!value) return null;
  const formatted = value.replace(/_/g, " ");
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

interface OrderActivityFeedProps {
  activities: OrderActivity[] | undefined;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

export function OrderActivityFeed({
  activities,
  isLoading = false,
  emptyTitle = "No activity yet",
  emptyDescription = "Events will appear here as the order progresses.",
  className,
}: OrderActivityFeedProps) {
  if (isLoading || activities === undefined) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground", className)}>
        <Loader2 className="size-5 animate-spin" />
        <span>Loading activity...</span>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 py-10 text-center", className)}>
        <History className="size-6 text-muted-foreground/40" />
        <p className="text-sm font-medium">{emptyTitle}</p>
        {emptyDescription && (
          <p className="max-w-xs text-xs text-muted-foreground">{emptyDescription}</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-0", className)}>
      {activities.map((activity, index) => {
        const meta = ACTIVITY_META[activity.action] ?? {
          label: activity.action.replace(/_/g, " "),
          icon: History,
          color: "bg-muted text-muted-foreground",
        };
        const Icon = meta.icon;
        const previous = formatValue(activity.previousValue);
        const next = formatValue(activity.newValue);

        return (
          <div key={activity._id} className="relative flex items-start gap-3 pb-5">
            {index < activities.length - 1 && (
              <div className="absolute left-[15px] top-9 h-[calc(100%-2rem)] w-px bg-border" aria-hidden="true" />
            )}
            <div className={cn("relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", meta.color)}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                <p className="text-sm font-medium capitalize">{meta.label}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(activity.createdAt)}
                </span>
              </div>
              {(previous || next) && (
                <p className="text-xs text-muted-foreground">
                  {previous && <span>{previous}</span>}
                  {previous && next && <span className="mx-1">→</span>}
                  {next && <span className="font-medium text-foreground/80">{next}</span>}
                </p>
              )}
              <p className="text-xs text-muted-foreground/80">
                by <span className="font-medium text-muted-foreground">{activity.actor}</span>
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
