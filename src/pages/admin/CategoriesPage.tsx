import { Button } from "@/components/ui/button";
import { AdminPlaceholderPage } from "@/components/admin/design-system/AdminLayout";
import { Plus, FolderTree } from "lucide-react";
import { EMPTY_MESSAGES } from "@/constants";

export default function CategoriesPage() {
  return (
    <AdminPlaceholderPage
      title="Categories"
      description="Organize your products into categories"
      headerAction={
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Category
        </Button>
      }
      emptyTitle="No categories yet"
      emptyDescription={EMPTY_MESSAGES.CATEGORIES}
      emptyIcon={FolderTree}
    />
  );
}
