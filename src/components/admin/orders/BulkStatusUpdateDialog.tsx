import { useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { OrderStatus } from "./types";
import { STATUS_LABELS } from "./types";

interface BulkStatusUpdateDialogProps {
  open: boolean;
  orderCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (status: OrderStatus) => void;
}

const statusOptions = Object.keys(STATUS_LABELS) as OrderStatus[];

export function BulkStatusUpdateDialog({ open, orderCount, onOpenChange, onConfirm }: BulkStatusUpdateDialogProps) {
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [lastOpen, setLastOpen] = useState(open);

  // Reset the picked status whenever the dialog opens again.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setTarget(null);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update status for {orderCount} order{orderCount === 1 ? "" : "s"}</AlertDialogTitle>
          <AlertDialogDescription>
            Choose a target status. Orders that are not eligible for the transition will be skipped and reported.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          <Select value={target ?? undefined} onValueChange={(v) => setTarget(v as OrderStatus)}>
            <SelectTrigger aria-label="Target status" className="w-full">
              <SelectValue placeholder="Select target status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction disabled={!target} onClick={() => target && onConfirm(target)}>
            Update status
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
