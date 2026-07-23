import { ArchiveRestore, Trash2 } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import type { Offer } from "./types";

interface OfferDialogsProps {
  deleteTarget?: Offer;
  restoreTarget?: Offer;
  onDeleteOpenChange: (open: boolean) => void;
  onRestoreOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  onConfirmRestore: () => void;
}

export function OfferDialogs({ deleteTarget, restoreTarget, onDeleteOpenChange, onRestoreOpenChange, onConfirmDelete, onConfirmRestore }: OfferDialogsProps) {
  return <>
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={onDeleteOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><Trash2 className="size-5 text-destructive" />Archive offer?</AlertDialogTitle><AlertDialogDescription><strong className="text-foreground">{deleteTarget?.title}</strong> will be archived and removed from active offer lists. It can be restored later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onConfirmDelete}>Archive offer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(restoreTarget)} onOpenChange={onRestoreOpenChange}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle className="flex items-center gap-2"><ArchiveRestore className="size-5" />Restore offer</AlertDialogTitle><AlertDialogDescription>Restoring <strong className="text-foreground">{restoreTarget?.title}</strong> will set it back to active and make it available on the storefront.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={onConfirmRestore}>Restore offer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
