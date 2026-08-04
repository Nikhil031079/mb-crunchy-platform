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

interface BulkCancelDialogProps {
  open: boolean;
  orderCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function BulkCancelDialog({ open, orderCount, onOpenChange, onConfirm }: BulkCancelDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {orderCount} order{orderCount === 1 ? "" : "s"}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will cancel all selected orders that are still cancellable. Reserved stock will be released and each
            cancellation will be recorded in the order timeline. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>
            Yes, cancel orders
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
