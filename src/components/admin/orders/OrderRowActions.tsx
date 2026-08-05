import { MoreHorizontal, ChevronRight, Ban, CheckCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import type { OrderRecord, OrderStatus, PaymentStatus } from "./types";
import { canCancel, getAllowedTransitions, getNextStatus, STATUS_LABELS } from "./types";

interface OrderRowActionsProps {
  order: OrderRecord;
  onAdvanceStatus: (order: OrderRecord) => void;
  onSetStatus: (order: OrderRecord, status: OrderStatus) => void;
  onUpdatePaymentStatus: (order: OrderRecord, paymentStatus: PaymentStatus) => void;
  onViewDetail: (order: OrderRecord) => void;
}

export function OrderRowActions({ order, onAdvanceStatus, onSetStatus, onUpdatePaymentStatus, onViewDetail }: OrderRowActionsProps) {
  const nextStatus = getNextStatus(order.status, order.orderType);
  const transitions = getAllowedTransitions(order.status, order.orderType).filter((s) => s !== "cancelled" && s !== "refunded" && s !== nextStatus);
  const cancellable = canCancel(order);
  const needsPaymentVerification = order.paymentStatus === "pending_verification";
  // Preparation must never begin before payment verification (enforced server-side).
  const awaitingPaymentBeforePrepare = nextStatus === "preparing" && order.paymentStatus !== "paid";

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
        {nextStatus && !awaitingPaymentBeforePrepare && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAdvanceStatus(order); }}>
              <ChevronRight aria-hidden="true" className="size-4" />
              Move to {STATUS_LABELS[nextStatus]}
            </DropdownMenuItem>
          </>
        )}
        {awaitingPaymentBeforePrepare && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              Awaiting payment verification
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
