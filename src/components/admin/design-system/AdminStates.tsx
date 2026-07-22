import * as React from "react";
import { AlertCircle, Inbox, SearchX } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";

interface AdminStateProps extends React.ComponentProps<"div"> { title: string; description?: string; icon?: LucideIcon; action?: React.ReactNode; }
export function AdminEmptyState({ title, description, icon: Icon = Inbox, action, className }: AdminStateProps) {
  return <EmptyState title={title} description={description} icon={Icon} action={action} disableMotion className={cn("min-h-56 border border-dashed rounded-lg px-6 py-12", className)} classNames={{ icon: "mb-4 flex size-12 items-center justify-center rounded-full bg-muted", iconSvg: "size-5 text-muted-foreground", title: "font-semibold", description: "mt-1 max-w-md text-sm text-muted-foreground", action: "mt-5" }} />;
}

interface AdminErrorStateProps extends Omit<AdminStateProps, "icon"> { onRetry?: () => void; retryLabel?: string; }
export function AdminErrorState({ title, description, action, onRetry, retryLabel = "Try again", className, ...props }: AdminErrorStateProps) {
  return <div role="alert" className={cn("flex min-h-56 flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center", className)} {...props}><AlertCircle className="size-6 text-destructive" aria-hidden="true" /><h3 className="mt-3 font-semibold">{title}</h3>{description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}<div className="mt-5">{action ?? (onRetry && <Button variant="outline" onClick={onRetry}>{retryLabel}</Button>)}</div></div>;
}

interface AdminLoadingStateProps extends React.ComponentProps<"div"> { rows?: number; columns?: number; }
export function AdminLoadingState({ rows = 5, columns = 4, className, ...props }: AdminLoadingStateProps) {
  return <div className={cn("space-y-3 p-4", className)} aria-busy="true" aria-label="Loading content" {...props}>{Array.from({ length: rows }, (_, rowIndex) => <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} key={rowIndex}>{Array.from({ length: columns }, (_, columnIndex) => <Skeleton key={columnIndex} className="h-8" />)}</div>)}</div>;
}

export function AdminNoSearchResults({ query, onClear, className }: { query?: string; onClear?: () => void; className?: string }) {
  return <AdminEmptyState className={className} icon={SearchX} title="No results found" description={query ? `No results match “${query}”.` : "Try adjusting your search or filters."} action={onClear && <Button variant="outline" onClick={onClear}>Clear search</Button>} />;
}
