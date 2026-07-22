import { Button } from "@/components/ui/button";
import { AdminPlaceholderPage } from "@/components/admin/design-system/AdminLayout";
import { Plus, Package } from "lucide-react";
import { EMPTY_MESSAGES } from "@/constants";

export default function ProductsPage() {
  return (
    <AdminPlaceholderPage
      title="Products"
      description="Manage your product catalog"
      headerAction={
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Product
        </Button>
      }
      emptyTitle="No products yet"
      emptyDescription={EMPTY_MESSAGES.PRODUCTS}
      emptyIcon={Package}
    />
  );
}
