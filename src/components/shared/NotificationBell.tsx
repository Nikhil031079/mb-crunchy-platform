import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { Bell, Check, CheckCheck, Package, Tag, Info, AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { api } from "@convex/_generated/api";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { InAppNotificationType } from "@/types";

// ============================================================================
// NotificationBell — bell icon with unread count + dropdown
// ============================================================================

interface NotificationBellProps {
  userId: string;
  className?: string;
}

const TYPE_CONFIG: Record<InAppNotificationType, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  order_update: { icon: Package, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/50" },
  promotion: { icon: Tag, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50" },
  system: { icon: Info, color: "text-gray-600 bg-gray-50 dark:bg-gray-950/50" },
  low_stock: { icon: AlertTriangle, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/50" },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationBell({ userId, className }: NotificationBellProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const unreadCount = useQuery(
    api.inAppNotifications.getUnreadCount,
    userId ? { userId } : "skip",
  );

  const notifications = useQuery(
    api.inAppNotifications.getForUser,
    userId ? { userId, limit: 20 } : "skip",
  );

  const markRead = useMutation(api.inAppNotifications.markRead);
  const markAllRead = useMutation(api.inAppNotifications.markAllRead);

  const handleMarkAllRead = useCallback(async () => {
    if (!userId) return;
    await markAllRead({ userId });
  }, [userId, markAllRead]);

  const handleMarkRead = useCallback(async (id: string) => {
    await markRead({ notificationId: id as any });
  }, [markRead]);

  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        className="relative h-9 w-9"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount !== undefined && unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={handleClose} />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                <h3 className="text-sm font-semibold">Notifications</h3>
                <div className="flex items-center gap-1">
                  {unreadCount !== undefined && unreadCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="h-7 gap-1 text-xs">
                      <CheckCheck className="h-3 w-3" />
                      Read all
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={handleClose} className="h-7 w-7">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Notification List */}
              <div className="max-h-80 overflow-y-auto">
                {!notifications ? (
                  <div className="p-4 space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex gap-3 animate-pulse">
                        <div className="h-8 w-8 shrink-0 rounded-lg bg-secondary" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-3/4 rounded bg-secondary" />
                          <div className="h-2.5 w-1/2 rounded bg-secondary" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <Bell className="mb-2 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const config = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
                    const Icon = config.icon;
                    return (
                      <button
                        key={n._id}
                        onClick={() => {
                          if (!n.read) handleMarkRead(n._id);
                          if (n.link) {
                            if (n.link.startsWith("/")) {
                              navigate(n.link);
                            } else {
                              window.location.href = n.link;
                            }
                          }
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50",
                          !n.read && "bg-primary/5",
                        )}
                      >
                        <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", config.color)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn("text-sm leading-tight", !n.read && "font-medium")}>
                              {n.title}
                            </p>
                            {!n.read && (
                              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {n.body}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground/60">
                            {timeAgo(n.createdAt)}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
