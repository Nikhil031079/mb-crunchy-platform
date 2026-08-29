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

import type { MealDealRecord } from "./types";

interface MealDealDialogsProps {
  deleteTarget: MealDealRecord | undefined;
  restoreTarget: MealDealRecord | undefined;
  onDeleteOpenChange: (open: boolean) => void;
  onRestoreOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  onConfirmRestore: () => void;
}

export function MealDealDialogs({
  deleteTarget,
  restoreTarget,
  onDeleteOpenChange,
  onRestoreOpenChange,
  onConfirmDelete,
  onConfirmRestore,
}: MealDealDialogsProps) {
  return (
    <>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={onDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Meal Deal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive <strong>{deleteTarget?.name}</strong>?
              It will no longer be available to customers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(restoreTarget)} onOpenChange={onRestoreOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Meal Deal</AlertDialogTitle>
            <AlertDialogDescription>
              Restore <strong>{restoreTarget?.name}</strong>?
              It will become active and available to customers again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmRestore}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
