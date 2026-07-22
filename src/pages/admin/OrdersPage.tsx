import { AdminPlaceholderPage } from "@/components/admin/design-system/AdminLayout";
import { ShoppingCart } from "lucide-react";
import { EMPTY_MESSAGES } from "@/constants";

export default function OrdersPage() {
  return (
    <AdminPlaceholderPage
      title="Orders"
      description="View and manage customer orders"
      emptyTitle="No orders yet"
      emptyDescription={EMPTY_MESSAGES.ORDERS}
      emptyIcon={ShoppingCart}
    />
  );
}
