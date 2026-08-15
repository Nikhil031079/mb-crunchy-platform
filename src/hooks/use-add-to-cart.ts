import { useCallback } from "react";
import { toast } from "sonner";

import { useCart } from "@/stores/cart";
import type { CatalogItem } from "@/types";

// ============================================================================
// Shared add-to-cart handler for customer-facing sections
// ============================================================================

export function useAddToCart() {
  const { addItem } = useCart();

  return useCallback(
    async (product: CatalogItem) => {
      const added = await addItem({
        catalogItemId: product._id,
        itemType: product.itemType,
        businessUnitId: product.businessUnitId,
        name: product.name,
        variantName: "Default",
        quantity: 1,
        unitPrice: product.price ?? 0,
        image: product.coverImage || product.thumbnail,
      });
      if (added) {
        toast.success("Added to cart", { description: product.name });
      }
    },
    [addItem],
  );
}