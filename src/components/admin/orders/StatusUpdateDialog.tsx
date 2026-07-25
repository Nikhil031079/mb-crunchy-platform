import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

import type { OrderRecord, OrderStatus } from "./types";
import { STATUS_LABELS } from "./types";

interface StatusUpdateDialogProps {
  open: boolean;
  order: OrderRecord | null;
  targetStatus: OrderStatus | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

const descriptions: Record<string, string> = {
  confirmed: "This will accept the order and deduct stock from inventory.",
  preparing: "Mark this order as being prepared in the kitchen.",
  ready: "This order is ready for pickup or dispatch.",
  out_for_delivery: "This order is now out for delivery.",
  delivered: "Mark this order as successfully delivered.",
  cancelled: "This will cancel the order and release reserved stock. This action cannot be undone.",
  refunded: "This will refund the order and release reserved stock.",
};

export function StatusUpdateDialog({ open, order, targetStatus, onOpenChange, onConfirm }: StatusUpdateDialogProps) {
  if (!order || !targetStatus) return null;

  const isCancel = targetStatus === "cancelled" || targetStatus === "refunded";
  const fromLabel = STATUS_LABELS[order.status];
  const toLabel = STATUS_LABELS[targetStatus];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isCancel ? "Cancel order?" : `Move to "${toLabel}"?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isCancel ? (
              <span>{descriptions[targetStatus] ?? `Cancel order ${order.orderNumber}?`}</span>
            ) : (
              <span>
                Moving <span className="font-medium">{order.orderNumber}</span> from{" "}
                <span className="font-medium">{fromLabel}</span> to{" "}
                <span className="font-medium">{toLabel}</span>.
                {" "}{descriptions[targetStatus]}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction
            className={cn(isCancel && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            onClick={onConfirm}
          >
            {isCancel ? "Yes, cancel order" : `Confirm ${toLabel}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
