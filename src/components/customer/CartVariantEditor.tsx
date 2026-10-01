import { useState } from "react";
import { Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";
import { Button } from "@/components/ui/button";
import type { CartItem, InventoryItem, ProductVariant } from "@/types";

// ============================================================================
// CartVariantEditor (Phase 21D-C) — edit a cart line's variant in place
//
// The option list is built from the product's ACTIVE variants only (resolved
// by the caller via the canonical getActiveVariants helper). Availability is
// re-checked against storefront inventory before the change is applied —
// mirroring the server's fail-closed rules (21D-B M3) so a rejected switch
// leaves the cart untouched.
// ============================================================================

/**
 * 21D-C M4 — must this variant switch be rejected?
 *
 * Mirrors convex/inventory.ts resolveInventoryReservations
 * (failOnVariantMismatch) plus the storefront binary availability gate:
 * - No inventory data yet → block (never guess stock).
 * - Zero live rows → untracked product, allow.
 * - Rows exist but none for this variant → fail closed (tracked mismatch).
 * - Matching row must be available with stock on hand.
 */
export function isCartVariantUnavailable(
  inventory: InventoryItem[] | undefined,
  variantName: string
): boolean {
  if (!inventory) return true;
  const liveRows = inventory.filter((row) => !row.deletedAt);
  if (liveRows.length === 0) return false;
  const row = liveRows.find((r) => r.variantName === variantName);
  if (!row) return true;
  return !row.available || row.stockQuantity <= 0;
}

interface CartVariantEditorProps {
  item: CartItem;
  /** Product's ACTIVE variants (canonical order) — from getActiveVariants. */
  activeVariants: ProductVariant[];
  /** Storefront inventory for this line; undefined while the query loads. */
  inventory: InventoryItem[] | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Applies the change atomically in the cart store. True = in effect. */
  onApply: (next: { variantName: string; unitPrice: number }) => boolean;
}

export function CartVariantEditor({
  item,
  activeVariants,
  inventory,
  open,
  onOpenChange,
  onApply,
}: CartVariantEditorProps) {
  // Explicit customer choice for THIS line. Keyed by cartItemId so a stale
  // choice from another line is never applied silently.
  const [pending, setPending] = useState<{
    cartItemId: string;
    variantName: string;
  } | null>(null);

  // Selection: explicit choice first; otherwise the line's CURRENT variant
  // when it is still active. When the current variant is no longer active,
  // nothing is preselected — there is never a silent fallback to the default.
  const explicitChoice =
    pending && pending.cartItemId === item.cartItemId ? pending.variantName : null;
  const currentStillActive = activeVariants.some(
    (v) => v.optionValue === item.variantName
  );
  const selectedValue =
    explicitChoice ?? (currentStillActive ? item.variantName : null);

  const close = () => {
    setPending(null);
    onOpenChange(false);
  };

  const handleSave = () => {
    if (selectedValue === null) return; // no explicit/current-valid choice
    const variant = activeVariants.find((v) => v.optionValue === selectedValue);
    if (!variant) {
      toast.error("Couldn't update variant", {
        description: `${item.name} could not be updated. Your cart was not changed.`,
      });
      return;
    }
    if (isCartVariantUnavailable(inventory, variant.optionValue)) {
      toast.error("Variant unavailable", {
        description: `${item.name} (${variant.optionValue}) is currently unavailable. Your cart was not changed.`,
      });
      return;
    }
    const applied = onApply({
      variantName: variant.optionValue,
      unitPrice: variant.price,
    });
    if (!applied) {
      toast.error("Couldn't update variant", {
        description: `${item.name} could not be updated. Your cart was not changed.`,
      });
      return;
    }
    setPending(null);
    onOpenChange(false);
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onOpenChange(true)}
        className="h-5 px-1.5 text-[10px] font-medium text-muted-foreground"
        aria-label={`Edit variant for ${item.name}`}
      >
        <Pencil className="mr-1 h-2.5 w-2.5" aria-hidden="true" />
        Edit
      </Button>
    );
  }

  return (
    <div
      role="group"
      aria-label={`Edit variant for ${item.name}`}
      className="mt-1.5 w-full space-y-2 rounded-xl border border-border/60 bg-background/80 p-2.5"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Choose variant</p>
        <button
          type="button"
          onClick={close}
          aria-label="Close variant editor"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {inventory === undefined ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Checking availability…
        </p>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label={`Variant options for ${item.name}`}
            className="flex flex-wrap gap-1.5"
          >
            {activeVariants.map((v) => {
              const unavailable = isCartVariantUnavailable(
                inventory,
                v.optionValue
              );
              const checked = selectedValue === v.optionValue;
              return (
                <button
                  key={v.optionValue}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={unavailable}
                  onClick={() =>
                    setPending({
                      cartItemId: item.cartItemId ?? "",
                      variantName: v.optionValue,
                    })
                  }
                  className={cn(
                    "rounded-lg border px-2 py-1 text-left transition-colors",
                    checked
                      ? "border-primary bg-primary/10"
                      : "border-border bg-white/60 hover:border-primary/40 dark:bg-white/5",
                    unavailable && "cursor-not-allowed opacity-60"
                  )}
                >
                  <span className="block text-xs font-medium">
                    {v.optionValue}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {formatCurrency(v.price)}
                  </span>
                  {unavailable && (
                    <span className="block text-[10px] font-semibold text-destructive">
                      Unavailable
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={selectedValue === null}
            >
              Save
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
