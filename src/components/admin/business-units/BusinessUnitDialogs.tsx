import { ArchiveRestore, Trash2 } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import type { BusinessUnit } from "./types";

interface BusinessUnitDialogsProps {
  deleteTarget?: BusinessUnit;
  restoreTarget?: BusinessUnit;
  onDeleteOpenChange: (open: boolean) => void;
  onRestoreOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  onConfirmRestore: () => void;
}

export function BusinessUnitDialogs({ deleteTarget, restoreTarget, onDeleteOpenChange, onRestoreOpenChange, onConfirmDelete, onConfirmRestore }: BusinessUnitDialogsProps) {
  return <>
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={onDeleteOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><Trash2 className="size-5 text-destructive" />Archive business unit?</AlertDialogTitle><AlertDialogDescription><strong className="text-foreground">{deleteTarget?.name}</strong> will be archived and removed from active business unit lists. It can be restored later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onConfirmDelete}>Archive unit</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(restoreTarget)} onOpenChange={onRestoreOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><ArchiveRestore className="size-5" />Restore business unit</AlertDialogTitle><AlertDialogDescription>Restoring <strong className="text-foreground">{restoreTarget?.name}</strong> will set it back to active and make it available on the storefront.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={onConfirmRestore}>Restore unit</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
