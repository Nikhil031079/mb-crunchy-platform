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

import type { InventoryRecord } from "./types";

interface InventoryDialogsProps {
  deleteTarget: InventoryRecord | null;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}

export function InventoryDialogs({ deleteTarget, onDeleteOpenChange, onConfirmDelete }: InventoryDialogsProps) {
  return (
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={onDeleteOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete inventory item?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove <span className="font-medium">{deleteTarget?.itemName}</span> — <span className="font-medium">{deleteTarget?.variantName}</span> from inventory tracking. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
