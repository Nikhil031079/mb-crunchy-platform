import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { Heart, Bookmark, Clock, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/stores/cart";
import { ROUTES } from "@/constants";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CollectionGrid } from "@/components/customer";

import type {
  CollectionType,
  CustomerCollection,
  CatalogItemType,
} from "@/types";

// ============================================================================
// Tabs
// ============================================================================

interface Tab {
  id: CollectionType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  emptyMessage: string;
}

const TABS: Tab[] = [
  {
    id: "favorites",
    label: "Favourites",
    icon: Heart,
    emptyMessage: "No favourites yet. Tap the heart icon on any item to save it here.",
  },
  {
    id: "wishlist",
    label: "Wishlist",
    icon: Bookmark,
    emptyMessage: "Your wishlist is empty. Save items for later!",
  },
  {
    id: "savedForLater",
    label: "Saved for Later",
    icon: Clock,
    emptyMessage: "No items saved for later yet.",
  },
];

// ============================================================================
// FavouritesPage
// ============================================================================

export default function FavouritesPage() {
  const { user } = useAuth();
  const { addItem } = useCart();
  const [activeTab, setActiveTab] = useState<CollectionType>("favorites");

  // Fetch customer
  const customer = useQuery(api.customers.getByAuthUser, {});
  const customerId = customer?._id;

  // Fetch collection items for each tab
  const favItems = useQuery(
    api.collections.getByCustomerAndType,
    customerId ? { customerId, collectionType: "favorites" } : "skip",
  );
  const wishItems = useQuery(
    api.collections.getByCustomerAndType,
    customerId ? { customerId, collectionType: "wishlist" } : "skip",
  );
  const savedItems = useQuery(
    api.collections.getByCustomerAndType,
    customerId ? { customerId, collectionType: "savedForLater" } : "skip",
  );

  // Remove mutation
  const removeMutation = useMutation(api.collections.remove);

  const getItems = useCallback(
    (tab: CollectionType): CustomerCollection[] | undefined => {
      switch (tab) {
        case "favorites":
          return favItems;
        case "wishlist":
          return wishItems;
        case "savedForLater":
          return savedItems;
        default:
          return undefined;
      }
    },
    [favItems, wishItems, savedItems],
  );

  const currentItems = getItems(activeTab) ?? [];
  const currentTab = TABS.find((t) => t.id === activeTab)!;

  // Handle add to cart from collection
  const handleAddToCart = useCallback(
    (item: CustomerCollection) => {
      // The collection item references a catalogItemId but we don't have
      // the full catalog item data here. We use the stored metadata.
      // For MVP, we show a toast indicating the item needs to be viewed.
      toast.info("Open the product page to add to cart", {
        description: `View this ${item.itemType} to add it to your cart.`,
      });
    },
    [],
  );

  // Handle remove from collection
  const handleRemove = useCallback(
    async (item: CustomerCollection) => {
      if (!customerId) return;
      try {
        await removeMutation({
          customerId,
          collectionType: activeTab,
          itemType: item.itemType,
          itemId: item.itemId,
        });
        toast.success("Removed", {
          description: `Item removed from ${currentTab.label}.`,
        });
      } catch {
        toast.error("Failed to remove item");
      }
    },
    [customerId, activeTab, removeMutation, currentTab.label],
  );

  const isLoading = currentItems === undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Heart className="h-4 w-4" />
            My Collections
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tab Buttons */}
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const count =
                tab.id === "favorites"
                  ? favItems?.length
                  : tab.id === "wishlist"
                  ? wishItems?.length
                  : savedItems?.length;
              return (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "gap-1.5 text-xs",
                    activeTab === tab.id && "pointer-events-none",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {count !== undefined && count > 0 && (
                    <span className="ml-1 text-[10px] opacity-70">
                      ({count})
                    </span>
                  )}
                </Button>
              );
            })}
          </div>

          {/* Collection Grid */}
          <CollectionGrid
            items={currentItems}
            onAddToCart={handleAddToCart}
            onRemove={handleRemove}
            emptyMessage={currentTab.emptyMessage}
            loading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
