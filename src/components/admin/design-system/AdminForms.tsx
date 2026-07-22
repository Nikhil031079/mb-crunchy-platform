import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function AdminFormLayout({ className, ...props }: React.ComponentProps<"form">) { return <form className={cn("space-y-6", className)} {...props} />; }

interface AdminFormSectionProps extends React.ComponentProps<"fieldset"> { title?: string; description?: string; }
export function AdminFormSection({ title, description, children, className, ...props }: AdminFormSectionProps) { return <fieldset className={cn("space-y-4 rounded-lg border p-4 sm:p-6", className)} {...props}>{(title || description) && <legend className="px-1"><span className="font-semibold">{title}</span>{description && <span className="mt-1 block text-sm font-normal text-muted-foreground">{description}</span>}</legend>}{children}</fieldset>; }

export function AdminFormActions({ className, ...props }: React.ComponentProps<"div">) { return <div className={cn("flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end", className)} {...props} />; }

export function RequiredBadge({ className, ...props }: React.ComponentProps<typeof Badge>) { return <Badge variant="outline" className={cn("border-destructive/30 text-[10px] font-medium text-destructive", className)} {...props}>Required</Badge>; }

interface AdminFieldLabelProps extends React.ComponentProps<typeof Label> { required?: boolean; hint?: string; }
export function AdminFieldLabel({ required = false, hint, children, className, ...props }: AdminFieldLabelProps) { return <div className="space-y-1"><Label className={className} {...props}>{children}{required && <RequiredBadge />}</Label>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>; }
