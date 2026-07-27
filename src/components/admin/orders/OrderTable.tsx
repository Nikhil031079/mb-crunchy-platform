import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Clock, Eye, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_COLORS } from "@/constants";
import { cn } from "@/lib/utils";

import { OrderRowActions } from "./OrderRowActions";
import type { OrderRecord, OrderSortKey, OrderStatus, PaymentStatus, SortDirection } from "./types";
import { getNextStatus, PAYMENT_STATUS_LABELS, STATUS_LABELS } from "./types";

// ---------------------------------------------------------------------------
// Elapsed timer (kitchen queue)
// ---------------------------------------------------------------------------

function ElapsedTimer({ createdAt }: { createdAt: number }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - createdAt);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - createdAt), 10_000);
    return () => clearInterval(id);
  }, [createdAt]);

  const totalMinutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const isUrgent = totalMinutes > 30;
  const isWarning = totalMinutes > 15;

  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums text-xs font-medium", isUrgent && "text-red-600", isWarning && !isUrgent && "text-amber-600", !isWarning && "text-muted-foreground")}>
      <Clock aria-hidden="true" className="size-3" />
      {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sort button
// ---------------------------------------------------------------------------

function SortButton({ column, label, sortKey, sortDirection, onSort }: { column: OrderSortKey; label: string; sortKey: OrderSortKey; sortDirection: SortDirection; onSort: (key: OrderSortKey) => void }) {
  const isActive = column === sortKey;
  const Icon = isActive ? (sortDirection === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" onClick={() => onSort(column)}>
      {label}
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{isActive ? `, sorted ${sortDirection === "asc" ? "ascending" : "descending"}` : ", sort"}</span>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Status badge tone
// ---------------------------------------------------------------------------

function statusTone(status: OrderStatus): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "delivered": return "success";
    case "confirmed":
    case "preparing":
    case "ready":
    case "out_for_delivery": return "warning";
    case "cancelled":
    case "refunded": return "danger";
    default: return "neutral";
  }
}

// ---------------------------------------------------------------------------
// Table props
// ---------------------------------------------------------------------------

interface OrderTableProps {
  orders: OrderRecord[];
  isLoading?: boolean;
  sortKey: OrderSortKey;
  sortDirection: SortDirection;
  onSort: (key: OrderSortKey) => void;
  onViewDetail: (order: OrderRecord) => void;
  onQuickStatus: (order: OrderRecord) => void;
  onCancel: (order: OrderRecord) => void;
  onUpdatePaymentStatus: (order: OrderRecord, paymentStatus: PaymentStatus) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrderTable({ orders, isLoading = false, sortKey, sortDirection, onSort, onViewDetail, onQuickStatus, onCancel, onUpdatePaymentStatus }: OrderTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><SortButton column="orderNumber" label="Order #" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead><SortButton column="customerName" label="Customer" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead>Items</TableHead>
          <TableHead className="text-right"><SortButton column="total" label="Total" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead>Type</TableHead>
          <TableHead><SortButton column="status" label="Status" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead>Payment</TableHead>
          <TableHead><SortButton column="createdAt" label="Time" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading
          ? Array.from({ length: 6 }, (_, i) => (
            <TableRow key={i}>
              {Array.from({ length: 9 }, (_, j) => <TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>)}
            </TableRow>
          ))
          : orders.map((order) => {
            const nextStatus = getNextStatus(order.status);
            return (
              <TableRow key={order.id} className="cursor-pointer" onClick={() => onViewDetail(order)}>
                <TableCell className="font-mono text-xs font-medium">{order.orderNumber}</TableCell>
                <TableCell>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{order.customerName}</p>
                    <p className="truncate text-xs text-muted-foreground">{order.customerPhone}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm tabular-nums">{order.itemCount}</TableCell>
                <TableCell className="text-right text-sm font-medium tabular-nums">₹{order.total.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-xs capitalize", order.orderType === "delivery" ? "border-purple-200 bg-purple-500/10 text-purple-700" : "border-sky-200 bg-sky-500/10 text-sky-700")}>
                    {order.orderType}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[order.status])}>
                    {STATUS_LABELS[order.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-xs", order.paymentStatus === "paid" ? "border-emerald-200 bg-emerald-500/10 text-emerald-700" : order.paymentStatus === "pending_verification" ? "border-amber-200 bg-amber-500/10 text-amber-700" : order.paymentStatus === "rejected" ? "border-red-200 bg-red-500/10 text-red-700" : "border-muted-foreground/20 bg-muted/50 text-muted-foreground")}>
                    {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <ElapsedTimer createdAt={order.createdAt} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {nextStatus && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => onQuickStatus(order)}
                        title={`Move to ${STATUS_LABELS[nextStatus]}`}
                      >
                        {STATUS_LABELS[nextStatus]}
                        <ChevronRight aria-hidden="true" className="size-3" />
                      </Button>
                    )}
                    {order.status !== "delivered" && order.status !== "cancelled" && order.status !== "refunded" && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => onCancel(order)}>
                        Cancel
                      </Button>
                    )}
                    {order.paymentStatus === "pending_verification" && (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-600" onClick={() => onUpdatePaymentStatus(order, "paid")}>
                          Pay
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => onUpdatePaymentStatus(order, "rejected")}>
                          Reject
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => onViewDetail(order)}>
                      <Eye aria-hidden="true" className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
}
