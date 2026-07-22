import { Button } from "@/components/ui/button";
import { AdminPlaceholderPage } from "@/components/admin/design-system/AdminLayout";
import { Plus, PartyPopper } from "lucide-react";
import { EMPTY_MESSAGES } from "@/constants";

export default function PartyPacksPage() {
  return (
    <AdminPlaceholderPage
      title="Party Packs"
      description="Configure party packs for events"
      headerAction={
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Party Pack
        </Button>
      }
      emptyTitle="No party packs yet"
      emptyDescription={EMPTY_MESSAGES.PARTY_PACKS}
      emptyIcon={PartyPopper}
    />
  );
}
