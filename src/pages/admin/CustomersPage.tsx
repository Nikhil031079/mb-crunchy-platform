import { AdminPlaceholderPage } from "@/components/admin/design-system/AdminLayout";
import { Users } from "lucide-react";
import { EMPTY_MESSAGES } from "@/constants";

export default function CustomersPage() {
  return (
    <AdminPlaceholderPage
      title="Customers"
      description="View and manage your customers"
      emptyTitle="No customers yet"
      emptyDescription={EMPTY_MESSAGES.CUSTOMERS}
      emptyIcon={Users}
    />
  );
}
