import { ArchiveDialog, RestoreDialog } from "@/components/admin/design-system/AdminDialogs";
import type { Banner } from "./types";

interface BannerDialogsProps {
  deleteTarget?: Banner;
  restoreTarget?: Banner;
  onDeleteOpenChange: (open: boolean) => void;
  onRestoreOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  onConfirmRestore: () => void;
}

export function BannerDialogs({ deleteTarget, restoreTarget, onDeleteOpenChange, onRestoreOpenChange, onConfirmDelete, onConfirmRestore }: BannerDialogsProps) {
  return (
    <>
      <ArchiveDialog
        open={Boolean(deleteTarget)}
        onOpenChange={onDeleteOpenChange}
        description={deleteTarget ? `Archive "${deleteTarget.title}"? It can be restored later.` : ""}
        onConfirm={onConfirmDelete}
      />
      <RestoreDialog
        open={Boolean(restoreTarget)}
        onOpenChange={onRestoreOpenChange}
        description={restoreTarget ? `Restore "${restoreTarget.title}"?` : ""}
        onConfirm={onConfirmRestore}
      />
    </>
  );
}
