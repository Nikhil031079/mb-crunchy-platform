import * as React from "react";
import { Check, Search } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { adminBadgeVariants } from "./variants";

export function AdminSearch({ className, ...props }: React.ComponentProps<typeof Input>) { return <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input type="search" className={cn("pl-9", className)} {...props} /></div>; }

export interface AdminFilterOption { value: string; label: string; disabled?: boolean; }
interface AdminFilterSelectProps { value?: string; onValueChange?: (value: string) => void; options: readonly AdminFilterOption[]; placeholder?: string; label?: string; className?: string; disabled?: boolean; }
export function AdminFilterSelect({ value, onValueChange, options, placeholder = "Select an option", label, className, disabled }: AdminFilterSelectProps) { return <Select value={value} onValueChange={onValueChange} disabled={disabled}><SelectTrigger aria-label={label ?? placeholder} className={cn("w-full sm:w-44", className)}><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectContent></Select>; }

export type AdminStatusTone = "success" | "warning" | "danger" | "neutral" | "archived";
export function AdminStatusBadge({ children, tone = "neutral", className, ...props }: React.ComponentProps<typeof Badge> & { tone?: AdminStatusTone }) { return <Badge variant="outline" className={cn(adminBadgeVariants({ tone }), className)} {...props}>{children}</Badge>; }
export function SuccessBadge(props: React.ComponentProps<typeof AdminStatusBadge>) { return <AdminStatusBadge tone="success" {...props} />; }
export function WarningBadge(props: React.ComponentProps<typeof AdminStatusBadge>) { return <AdminStatusBadge tone="warning" {...props} />; }
export function DangerBadge(props: React.ComponentProps<typeof AdminStatusBadge>) { return <AdminStatusBadge tone="danger" {...props} />; }
export function NeutralBadge(props: React.ComponentProps<typeof AdminStatusBadge>) { return <AdminStatusBadge tone="neutral" {...props} />; }
export function ArchivedBadge(props: React.ComponentProps<typeof AdminStatusBadge>) { return <AdminStatusBadge tone="archived" {...props} />; }

interface AdminColorPreviewProps extends React.ComponentProps<"span"> { color: string; label?: string; showValue?: boolean; }
export function AdminColorPreview({ color, label, showValue = true, className, ...props }: AdminColorPreviewProps) { const accessibleLabel = label ? `${label}: ${color}` : `Color ${color}`; return <span className={cn("inline-flex items-center gap-2 text-sm", className)} {...props}><span className="size-5 rounded-full border shadow-xs" style={{ backgroundColor: color }} role="img" aria-label={accessibleLabel} />{showValue && <span>{color}</span>}</span>; }

interface AdminAvatarProps extends React.ComponentProps<typeof Avatar> { name: string; src?: string; }
export function AdminAvatar({ name, src, className, ...props }: AdminAvatarProps) { const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); return <Avatar className={cn("size-9 border", className)} {...props}>{src && <AvatarImage src={src} alt={`${name} avatar`} />}<AvatarFallback aria-label={`${name} avatar`}>{initials || <Check className="size-4" aria-hidden="true" />}</AvatarFallback></Avatar>; }

interface AdminSwitchProps extends React.ComponentProps<typeof Switch> { label: string; description?: string; }
export function AdminSwitch({ label, description, id, className, ...props }: AdminSwitchProps) { const switchId = React.useId(); const resolvedId = id ?? switchId; return <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><div><label htmlFor={resolvedId} className="text-sm font-medium">{label}</label>{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}</div><Switch id={resolvedId} className={className} {...props} /></div>; }
