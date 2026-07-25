import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useConvex } from "convex/react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

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
    customerId
      ? { customerId: customerId as Id<"customers">, collectionType }
      : "skip",
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
        customerId: customerId as Id<"customers">,
        collectionType,
        itemType,
        itemId: itemId as Id<"catalogItems">,
      });
      return result.added;
    },
    [customerId, toggleMutation],
  );

  const add = useCallback(
    async (collectionType: CollectionType, itemType: CatalogItemType, itemId: string) => {
      if (!customerId) return;
      await addMutation({
        customerId: customerId as Id<"customers">,
        collectionType,
        itemType,
        itemId: itemId as Id<"catalogItems">,
      });
    },
    [customerId, addMutation],
  );

  const remove = useCallback(
    async (collectionType: CollectionType, itemType: CatalogItemType, itemId: string) => {
      if (!customerId) return;
      await removeMutation({
        customerId: customerId as Id<"customers">,
        collectionType,
        itemType,
        itemId: itemId as Id<"catalogItems">,
      });
    },
    [customerId, removeMutation],
  );

  return { toggle, add, remove };
}

// ============================================================================
// useCollectionCheck — Check which items are in a collection (for card grids)
// ============================================================================

export function useCollectionCheck(customerId: string | undefined) {
  const convex = useConvex();

  const check = useCallback(
    async (items: { itemType: CatalogItemType; itemId: string }[]) => {
      if (!customerId || items.length === 0) return {} as Record<string, boolean>;
      const results = await convex.query(api.collections.getByCustomer, {
        customerId: customerId as Id<"customers">,
      });
      const inCollection = new Set(
        (results as Array<{ itemType: string; itemId: string }>).map(
          (r) => `${r.itemType}:${r.itemId}`,
        ),
      );
      const result: Record<string, boolean> = {};
      for (const item of items) {
        result[item.itemId] = inCollection.has(`${item.itemType}:${item.itemId}`);
      }
      return result;
    },
    [customerId, convex],
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
