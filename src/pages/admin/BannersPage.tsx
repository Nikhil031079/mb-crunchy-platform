import { Button } from "@/components/ui/button";
import { AdminPlaceholderPage } from "@/components/admin/design-system/AdminLayout";
import { Plus, Image } from "lucide-react";
import { EMPTY_MESSAGES } from "@/constants";

export default function BannersPage() {
  return (
    <AdminPlaceholderPage
      title="Banners"
      description="Manage promotional banners"
      headerAction={
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Banner
        </Button>
      }
      emptyTitle="No banners yet"
      emptyDescription={EMPTY_MESSAGES.BANNERS}
      emptyIcon={Image}
    />
  );
}
