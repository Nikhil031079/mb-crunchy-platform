import { ArchiveDialog } from "@/components/admin/design-system/AdminDialogs";

import { sectionTypeLabels } from "./types";
import type { HomepageSectionRow } from "./types";

interface HomepageSectionDialogsProps {
  deleteTarget: HomepageSectionRow | undefined;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}

export function HomepageSectionDialogs({
  deleteTarget,
  onDeleteOpenChange,
  onConfirmDelete,
}: HomepageSectionDialogsProps) {
  return (
    <ArchiveDialog
      open={Boolean(deleteTarget)}
      onOpenChange={onDeleteOpenChange}
      description={
        deleteTarget
          ? `Remove the "${sectionTypeLabels[deleteTarget.sectionType]}" section${deleteTarget.target === "both" ? " from both stores" : ""}? This can be restored later.`
          : undefined
      }
      onConfirm={onConfirmDelete}
    />
  );
}
