import { useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";

import { api } from "@convex/_generated/api";

import type { CollectionType, CatalogItemType } from "@/types";

// ============================================================================
// useCollectionItems — Fetch items for a specific collection type
// ============================================================================

export function useCollectionItems(
  customerId: string | undefined,
  collectionType: CollectionType,
) {
  return useQuery(
    api.collections.getByCustomerAndType,
    customerId ? { customerId, collectionType } : "skip",
  );
}

// ============================================================================
// useCollectionActions — Toggle / add / remove mutations
// ============================================================================

export function useCollectionActions(customerId: string | undefined) {
  const toggleMutation = useMutation(api.collections.toggle);
  const addMutation = useMutation(api.collections.add);
  const removeMutation = useMutation(api.collections.remove);

  const toggle = useCallback(
    async (collectionType: CollectionType, itemType: CatalogItemType, itemId: string) => {
      if (!customerId) return false;
      const result = await toggleMutation({
        customerId,
        collectionType,
        itemType,
        itemId,
      });
      return result.added;
    },
    [customerId, toggleMutation],
  );

  const add = useCallback(
    async (collectionType: CollectionType, itemType: CatalogItemType, itemId: string) => {
      if (!customerId) return;
      await addMutation({ customerId, collectionType, itemType, itemId });
    },
    [customerId, addMutation],
  );

  const remove = useCallback(
    async (collectionType: CollectionType, itemType: CatalogItemType, itemId: string) => {
      if (!customerId) return;
      await removeMutation({ customerId, collectionType, itemType, itemId });
    },
    [customerId, removeMutation],
  );

  return { toggle, add, remove };
}

// ============================================================================
// useCollectionCheck — Check which items are in a collection (for card grids)
// ============================================================================

export function useCollectionCheck(customerId: string | undefined) {
  const bulkCheck = useMutation(api.collections.bulkCheck);

  const check = useCallback(
    async (items: { itemType: CatalogItemType; itemId: string }[]) => {
      if (!customerId || items.length === 0) return {} as Record<string, boolean>;
      const results = await bulkCheck({ customerId, items });
      return results;
    },
    [customerId, bulkCheck],
  );

  return { check };
}

// ============================================================================
// useFavoritedIds — Derive a Set of favorited item IDs from collection items
// ============================================================================

export function useFavoritedIds(
  items: { itemId: string }[] | undefined,
): Set<string> {
  return useMemo(() => {
    if (!items) return new Set();
    return new Set(items.map((i) => i.itemId));
  }, [items]);
}
