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

interface BulkRefundDialogProps {
  open: boolean;
  orderCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function BulkRefundDialog({ open, orderCount, onOpenChange, onConfirm }: BulkRefundDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Refund {orderCount} order{orderCount === 1 ? "" : "s"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will refund all selected orders that have been delivered and paid. Payment status will be marked as
            refunded and each refund will be recorded in the order timeline.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Yes, refund orders
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
