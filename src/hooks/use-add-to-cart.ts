import { useCallback } from "react";
import { toast } from "sonner";

import { useCart } from "@/stores/cart";
import { getInlineVariants, resolveQuickAddVariantLine } from "@/utils/product-variants";
import type { CatalogItem } from "@/types";

// ============================================================================
// Shared add-to-cart handler for customer-facing sections
//
// Product lines resolve the CANONICAL default active variant (isDefault,
// else first by sortOrder) instead of hardcoding "Default", so quick-add
// identity matches the PDP, ProductCard and the server-side order checks.
// ============================================================================

export function useAddToCart() {
  const { addItem } = useCart();

  return useCallback(
    async (product: CatalogItem) => {
      const line = await resolveQuickAddVariantLine({
        itemType: product.itemType,
        name: product.name,
        price: product.price,
        sourceId: product.sourceId,
        variants: getInlineVariants(product),
      });

      if (!line) {
        toast.error("Unable to add to cart", {
          description: `${product.name || "This item"} could not be added right now. Please try again.`,
        });
        return;
      }

      const added = await addItem({
        catalogItemId: product._id,
        itemType: product.itemType,
        businessUnitId: product.businessUnitId,
        name: product.name,
        variantName: line.variantName,
        quantity: 1,
        unitPrice: line.unitPrice,
        image: product.coverImage || product.thumbnail,
      });
      if (added) {
        toast.success("Added to cart", { description: product.name });
      }
    },
    [addItem],
  );
}
