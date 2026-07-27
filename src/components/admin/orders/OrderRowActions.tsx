import { MoreHorizontal, ChevronRight, Ban, CheckCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import type { OrderRecord, OrderStatus, PaymentStatus } from "./types";
import { canCancel, getNextStatus, STATUS_LABELS, STATUS_TRANSITIONS } from "./types";

interface OrderRowActionsProps {
  order: OrderRecord;
  onAdvanceStatus: (order: OrderRecord) => void;
  onSetStatus: (order: OrderRecord, status: OrderStatus) => void;
  onUpdatePaymentStatus: (order: OrderRecord, paymentStatus: PaymentStatus) => void;
  onViewDetail: (order: OrderRecord) => void;
}

export function OrderRowActions({ order, onAdvanceStatus, onSetStatus, onUpdatePaymentStatus, onViewDetail }: OrderRowActionsProps) {
  const nextStatus = getNextStatus(order.status);
  const transitions = STATUS_TRANSITIONS[order.status].filter((s) => s !== "cancelled" && s !== "refunded" && s !== nextStatus);
  const cancellable = canCancel(order);
  const needsPaymentVerification = order.paymentStatus === "pending_verification";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal aria-hidden="true" className="size-4" />
          <span className="sr-only">Actions for {order.orderNumber}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewDetail(order); }}>
          View details
        </DropdownMenuItem>
        {nextStatus && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAdvanceStatus(order); }}>
              <ChevronRight aria-hidden="true" className="size-4" />
              Move to {STATUS_LABELS[nextStatus]}
            </DropdownMenuItem>
          </>
        )}
        {transitions.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {transitions.map((status) => (
              <DropdownMenuItem key={status} onClick={(e) => { e.stopPropagation(); onSetStatus(order, status); }}>
                Skip to {STATUS_LABELS[status]}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {cancellable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); onSetStatus(order, "cancelled"); }}>
              <Ban aria-hidden="true" className="size-4" />
              Cancel order
            </DropdownMenuItem>
          </>
        )}
        {needsPaymentVerification && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUpdatePaymentStatus(order, "paid"); }}>
              <CheckCircle aria-hidden="true" className="size-4 text-emerald-600" />
              Mark as Paid
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); onUpdatePaymentStatus(order, "rejected"); }}>
              <XCircle aria-hidden="true" className="size-4" />
              Reject Payment
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
