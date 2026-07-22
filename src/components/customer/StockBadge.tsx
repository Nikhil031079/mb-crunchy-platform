// ============================================================================
// StockBadge — display stock availability status
// ============================================================================

import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/types";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

export interface StockInfo {
  status: StockStatus;
  quantity: number;
  lowStockThreshold?: number;
}

/**
 * Compute stock status from inventory items for a given variant.
 * Returns "unknown" if no inventory data is available.
 */
export function getStockStatus(
  inventoryItems: InventoryItem[] | undefined,
  variantName: string
): StockInfo {
  if (!inventoryItems || inventoryItems.length === 0) {
    return { status: "unknown", quantity: -1 };
  }

  const item = inventoryItems.find(
    (inv) => inv.variantName === variantName && !inv.deletedAt
  );

  if (!item) {
    return { status: "unknown", quantity: -1 };
  }

  if (!item.available || item.stockQuantity <= 0) {
    return { status: "out_of_stock", quantity: 0, lowStockThreshold: item.lowStockAlert };
  }

  if (item.lowStockAlert && item.stockQuantity <= item.lowStockAlert) {
    return { status: "low_stock", quantity: item.stockQuantity, lowStockThreshold: item.lowStockAlert };
  }

  return { status: "in_stock", quantity: item.stockQuantity, lowStockThreshold: item.lowStockAlert };
}

/**
 * Get overall stock status for a product (checks all variants).
 * If any variant is in stock, product is available.
 */
export function getProductStockStatus(
  inventoryItems: InventoryItem[] | undefined,
  variantNames: string[]
): StockInfo {
  if (!inventoryItems || inventoryItems.length === 0) {
    return { status: "unknown", quantity: -1 };
  }

  const statuses = variantNames.map((v) => getStockStatus(inventoryItems, v));
  const allOutOfStock = statuses.every((s) => s.status === "out_of_stock");
  const anyLowStock = statuses.some((s) => s.status === "low_stock");
  const totalQuantity = statuses.reduce((sum, s) => sum + Math.max(0, s.quantity), 0);

  if (allOutOfStock) {
    return { status: "out_of_stock", quantity: 0 };
  }

  if (anyLowStock) {
    return { status: "low_stock", quantity: totalQuantity };
  }

  return { status: "in_stock", quantity: totalQuantity };
}

// ============================================================================
// StockBadge Component
// ============================================================================

interface StockBadgeProps {
  stockInfo: StockInfo;
  className?: string;
}

export function StockBadge({ stockInfo, className }: StockBadgeProps) {
  if (stockInfo.status === "unknown") return null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        stockInfo.status === "in_stock" && "bg-emerald-50 text-emerald-700",
        stockInfo.status === "low_stock" && "bg-amber-50 text-amber-700",
        stockInfo.status === "out_of_stock" && "bg-red-50 text-red-600",
        className
      )}
    >
      <span
        className={cn(
          "mr-1 h-1.5 w-1.5 rounded-full",
          stockInfo.status === "in_stock" && "bg-emerald-500",
          stockInfo.status === "low_stock" && "bg-amber-500",
          stockInfo.status === "out_of_stock" && "bg-red-400"
        )}
      />
      {stockInfo.status === "in_stock" && "In Stock"}
      {stockInfo.status === "low_stock" &&
        `Low Stock (${stockInfo.quantity} left)`}
      {stockInfo.status === "out_of_stock" && "Out of Stock"}
    </span>
  );
}
