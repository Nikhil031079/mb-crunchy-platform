import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "./AdminStates";

export function AdminTable({ className, ...props }: React.ComponentProps<typeof Table>) { return <Table className={cn("min-w-[40rem]", className)} {...props} />; }

export function AdminTableToolbar({ children, className, ...props }: React.ComponentProps<"div">) { return <div className={cn("flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between", className)} {...props}>{children}</div>; }

interface AdminTablePaginationProps extends Omit<React.ComponentProps<"nav">, "onChange"> { page: number; pageCount: number; onPageChange: (page: number) => void; itemCount?: number; pageSize?: number; }
export function AdminTablePagination({ page, pageCount, onPageChange, itemCount, pageSize, className, ...props }: AdminTablePaginationProps) {
  const totalPages = Math.max(1, pageCount); const start = itemCount !== undefined && pageSize ? (page - 1) * pageSize + 1 : undefined; const end = itemCount !== undefined && pageSize ? Math.min(page * pageSize, itemCount) : undefined;
  return <nav aria-label="Table pagination" className={cn("flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between", className)} {...props}><p className="text-muted-foreground">{itemCount !== undefined && start !== undefined && end !== undefined ? `Showing ${start}–${end} of ${itemCount}` : `Page ${page} of ${totalPages}`}</p><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft aria-hidden="true" />Previous</Button><span aria-live="polite" className="min-w-20 text-center">{page} / {totalPages}</span><Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next<ChevronRight aria-hidden="true" /></Button></div></nav>;
}

export const AdminTableEmpty = AdminEmptyState;
export const AdminTableLoading = AdminLoadingState;
export const AdminTableError = AdminErrorState;
