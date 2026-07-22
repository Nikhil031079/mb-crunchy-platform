import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";

interface AdminPageHeaderProps extends React.ComponentProps<"header"> { title: string; description?: string; actions?: React.ReactNode; }
export function AdminPageHeader({ title, description, actions, className, ...props }: AdminPageHeaderProps) {
  return <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)} {...props}><div className="min-w-0 space-y-1"><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{description && <p className="text-sm text-muted-foreground">{description}</p>}</div>{actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}</header>;
}

interface AdminSectionProps extends React.ComponentProps<"section"> { title?: string; description?: string; actions?: React.ReactNode; }
export function AdminSection({ title, description, actions, children, className, ...props }: AdminSectionProps) {
  return <section className={cn("space-y-4", className)} {...props}>{(title || description || actions) && <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div>{title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{actions && <div className="flex shrink-0 gap-2">{actions}</div>}</div>}{children}</section>;
}

interface AdminCardProps extends React.ComponentProps<"div"> { title?: string; description?: string; action?: React.ReactNode; }
export function AdminCard({ title, description, action, children, className, ...props }: AdminCardProps) {
  return <Card className={className} {...props}>{(title || description || action) && <CardHeader>{title && <CardTitle>{title}</CardTitle>}{description && <CardDescription>{description}</CardDescription>}{action && <div className="absolute right-6 top-6">{action}</div>}</CardHeader>}{children && <CardContent>{children}</CardContent>}</Card>;
}

interface AdminGridProps extends React.ComponentProps<"div"> { columns?: 1 | 2 | 3 | 4; }
const gridColumns = { 1: "grid-cols-1", 2: "grid-cols-1 md:grid-cols-2", 3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3", 4: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" } as const;
export function AdminGrid({ columns = 3, className, ...props }: AdminGridProps) { return <div className={cn("grid gap-4", gridColumns[columns], className)} {...props} />; }

interface StatCardProps extends React.ComponentProps<"div"> { label: string; value: React.ReactNode; }
export function StatCard({ label, value, className, ...props }: StatCardProps) {
  return <div className={cn("rounded-xl border border-border/60 p-5 space-y-2", className)} {...props}><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-bold">{value}</p></div>;
}

interface AdminPlaceholderPageProps { title: string; description: string; headerAction?: React.ReactNode; emptyTitle: string; emptyDescription: string; emptyIcon: React.ComponentType<{ className?: string }>; }
export function AdminPlaceholderPage({ title, description, headerAction, emptyTitle, emptyDescription, emptyIcon }: AdminPlaceholderPageProps) {
  return <div><PageHeader title={title} description={description}>{headerAction}</PageHeader><EmptyState title={emptyTitle} description={emptyDescription} icon={emptyIcon} /></div>;
}
