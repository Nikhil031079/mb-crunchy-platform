import { ArchiveRestore, Trash2 } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import type { Product } from "./types";

interface ProductDialogsProps {
  deleteTarget?: Product;
  restoreTarget?: Product;
  onDeleteOpenChange: (open: boolean) => void;
  onRestoreOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  onConfirmRestore: () => void;
}

export function ProductDialogs({ deleteTarget, restoreTarget, onDeleteOpenChange, onRestoreOpenChange, onConfirmDelete, onConfirmRestore }: ProductDialogsProps) {
  return <>
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={onDeleteOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><Trash2 className="size-5 text-destructive" />Archive product?</AlertDialogTitle><AlertDialogDescription><strong className="text-foreground">{deleteTarget?.name}</strong> will be archived and removed from active product lists. It can be restored later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onConfirmDelete}>Archive product</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(restoreTarget)} onOpenChange={onRestoreOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><ArchiveRestore className="size-5" />Restore product</AlertDialogTitle><AlertDialogDescription>Restoring <strong className="text-foreground">{restoreTarget?.name}</strong> will set it back to active and make it available on the storefront.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={onConfirmRestore}>Restore product</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
