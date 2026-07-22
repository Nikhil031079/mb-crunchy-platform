import { Button } from "@/components/ui/button";
import { AdminPlaceholderPage } from "@/components/admin/design-system/AdminLayout";
import { Plus, Tag } from "lucide-react";
import { EMPTY_MESSAGES } from "@/constants";

export default function OffersPage() {
  return (
    <AdminPlaceholderPage
      title="Offers & Promotions"
      description="Create and manage promotional offers"
      headerAction={
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Offer
        </Button>
      }
      emptyTitle="No offers yet"
      emptyDescription={EMPTY_MESSAGES.OFFERS}
      emptyIcon={Tag}
    />
  );
}
