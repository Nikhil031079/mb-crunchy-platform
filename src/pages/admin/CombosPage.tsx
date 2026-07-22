import { Button } from "@/components/ui/button";
import { AdminPlaceholderPage } from "@/components/admin/design-system/AdminLayout";
import { Plus, Combine } from "lucide-react";
import { EMPTY_MESSAGES } from "@/constants";

export default function CombosPage() {
  return (
    <AdminPlaceholderPage
      title="Combos"
      description="Create product combos and deals"
      headerAction={
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Combo
        </Button>
      }
      emptyTitle="No combos yet"
      emptyDescription={EMPTY_MESSAGES.COMBOS}
      emptyIcon={Combine}
    />
  );
}
