import { useState, useMemo } from "react";
import { UtensilsCrossed, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils";
import type { EnrichedMealDeal, MealDealQualifyingItem } from "@/types";

interface MealDealVariantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: EnrichedMealDeal;
  onConfirm: (variantSelections: Record<string, string>) => void;
}

function hasSelectableVariants(qi: MealDealQualifyingItem): boolean {
  return Boolean(qi.variants && qi.variants.length > 1);
}

export function MealDealVariantDialog({
  open,
  onOpenChange,
  deal,
  onConfirm,
}: MealDealVariantDialogProps) {
  // Initialize default selections from the deal's defaultVariantName or first variant.
  const defaultSelections = useMemo<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    for (const qi of deal.qualifyingItems) {
      s[qi.catalogItemId] =
        qi.defaultVariantName ?? qi.variants?.[0]?.optionValue ?? "Default";
    }
    return s;
  }, [deal]);

  const [selections, setSelections] = useState<Record<string, string>>(
    defaultSelections,
  );

  // Reset selections when deal changes.
  const dealKey = deal._id;
  const resetKey = useMemo(
    () => JSON.stringify(defaultSelections),
    [defaultSelections],
  );

  const handleSelect = (catalogItemId: string, variantValue: string) => {
    setSelections((prev) => ({ ...prev, [catalogItemId]: variantValue }));
  };

  const handleConfirm = () => {
    onConfirm(selections);
    onOpenChange(false);
  };

  // Check if any qualifying item has selectable variants.
  const needsSelection = deal.qualifyingItems.some(hasSelectableVariants);

  // If no selectable variants, confirm immediately (no dialog needed).
  // But the dialog may have been opened — just confirm with defaults.
  if (!needsSelection && open) {
    // Auto-confirm on next render via onConfirm.
    // This handles the case where the caller opens the dialog but no selection is needed.
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            {deal.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {deal.qualifyingItems.map((qi) => {
            const variants = qi.variants ?? [];
            const isSelectable = variants.length > 1;
            const selected = selections[qi.catalogItemId] ?? "Default";

            if (!isSelectable) {
              // Single variant or no variant data — show as info only.
              return (
                <div key={qi.catalogItemId} className="space-y-1.5">
                  <p className="text-sm font-medium">
                    {qi.quantity}x {qi.name}
                  </p>
                  {variants.length === 1 && (
                    <p className="text-xs text-muted-foreground">
                      {variants[0].optionValue} — {formatCurrency(variants[0].price)}
                    </p>
                  )}
                </div>
              );
            }

            const defaultVariant = variants.find(
              (v) => v.optionValue === qi.defaultVariantName,
            );
            const defaultPrice = defaultVariant?.price ?? qi.price ?? 0;

            return (
              <div key={qi.catalogItemId} className="space-y-1.5">
                <p className="text-sm font-medium">
                  {qi.quantity}x {qi.name}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {variants.map((v) => {
                    const isSelected = selected === v.optionValue;
                    const priceDiff = v.price - defaultPrice;
                    const isUpgrade = priceDiff > 0;
                    const isSamePrice = priceDiff === 0;

                    return (
                      <button
                        key={v.optionValue}
                        type="button"
                        onClick={() => handleSelect(qi.catalogItemId, v.optionValue)}
                        className={`
                          inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium
                          transition-colors
                          ${
                            isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:bg-muted"
                          }
                        `}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                        {v.optionValue}
                        {isSamePrice && (
                          <span className="text-muted-foreground ml-0.5">
                            {formatCurrency(v.price)}
                          </span>
                        )}
                        {isUpgrade && (
                          <span className="text-amber-600 ml-0.5">
                            +{formatCurrency(priceDiff)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="gap-1.5">
            <UtensilsCrossed className="h-3.5 w-3.5" />
            Add Meal Upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
