import * as React from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface AdminDialogProps { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; className?: string; }
export function AdminDialog({ open, onOpenChange, title, description, children, footer, className }: AdminDialogProps) { return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={cn("max-h-[calc(100vh-2rem)] overflow-y-auto", className)}><DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>{children}{footer && <DialogFooter>{footer}</DialogFooter>}</DialogContent></Dialog>; }

interface AdminConfirmDialogProps { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: React.ReactNode; confirmLabel?: string; cancelLabel?: string; onConfirm: () => void; tone?: "default" | "danger"; icon?: LucideIcon; }
export function AdminConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, tone = "default", icon: Icon }: AdminConfirmDialogProps) { return <AlertDialog open={open} onOpenChange={onOpenChange}><AlertDialogContent><AlertDialogHeader>{Icon && <Icon className={cn("size-5", tone === "danger" && "text-destructive")} aria-hidden="true" />}<AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{cancelLabel}</AlertDialogCancel><AlertDialogAction className={cn(tone === "danger" && "bg-destructive text-destructive-foreground hover:bg-destructive/90")} onClick={onConfirm}>{confirmLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>; }

type ActionDialogProps = Omit<AdminConfirmDialogProps, "title" | "confirmLabel" | "tone" | "icon">;
export function DeleteDialog(props: ActionDialogProps) { return <AdminConfirmDialog {...props} title="Delete item?" confirmLabel="Delete" tone="danger" icon={Trash2} />; }
export function ArchiveDialog(props: ActionDialogProps) { return <AdminConfirmDialog {...props} title="Archive item?" confirmLabel="Archive" tone="default" icon={Archive} />; }
export function RestoreDialog(props: ActionDialogProps) { return <AdminConfirmDialog {...props} title="Restore item?" confirmLabel="Restore" tone="default" icon={ArchiveRestore} />; }
