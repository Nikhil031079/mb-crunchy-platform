import { useState, useMemo, useCallback } from "react";
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

export interface MealDealSelections {
  /** slotIndex → selected catalogItemId */
  itemSelections: Record<string, string>;
  /** slotIndex → selected variantName */
  variantSelections: Record<string, string>;
}

interface MealDealVariantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: EnrichedMealDeal;
  onConfirm: (selections: MealDealSelections) => void;
}

function hasAlternatives(qi: MealDealQualifyingItem): boolean {
  return Boolean(qi.alternatives && qi.alternatives.length > 0);
}

function hasSelectableVariants(qi: MealDealQualifyingItem): boolean {
  return Boolean(qi.variants && qi.variants.length > 1);
}

function getAvailableVariants(
  qi: MealDealQualifyingItem,
  selectedCatalogItemId: string,
): MealDealQualifyingItem["variants"] {
  if (selectedCatalogItemId === qi.catalogItemId) {
    return qi.variants;
  }
  const alt = qi.alternatives?.find((a) => a.catalogItemId === selectedCatalogItemId);
  return alt?.variants;
}

function getDefaultVariantName(
  qi: MealDealQualifyingItem,
  selectedCatalogItemId: string,
): string | undefined {
  if (selectedCatalogItemId === qi.catalogItemId) {
    return qi.defaultVariantName;
  }
  const alt = qi.alternatives?.find((a) => a.catalogItemId === selectedCatalogItemId);
  return alt?.defaultVariantName;
}

export function MealDealVariantDialog({
  open,
  onOpenChange,
  deal,
  onConfirm,
}: MealDealVariantDialogProps) {
  // Selection state: slotIndex (string) → selected value
  const [selectedProducts, setSelectedProducts] = useState<Record<string, string>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

  // Initialize defaults when dialog opens with a new deal.
  const defaultProductSelections = useMemo<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    deal.qualifyingItems.forEach((qi, idx) => {
      s[String(idx)] = qi.catalogItemId;
    });
    return s;
  }, [deal]);

  const defaultVariantSelections = useMemo<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    deal.qualifyingItems.forEach((qi, idx) => {
      const variants = qi.variants ?? [];
      s[String(idx)] = qi.defaultVariantName ?? variants[0]?.optionValue ?? "Default";
    });
    return s;
  }, [deal]);

  // Reset when deal changes.
  const dealKey = deal._id;
  const initKey = useMemo(
    () => JSON.stringify(defaultProductSelections),
    [defaultProductSelections],
  );

  const handleProductSelect = useCallback((slotIndex: string, catalogItemId: string) => {
    setSelectedProducts((prev) => ({ ...prev, [slotIndex]: catalogItemId }));
    // Reset variant to default for the newly selected product.
    setSelectedVariants((prev) => {
      const qiIdx = Number(slotIndex);
      const qi = deal.qualifyingItems[qiIdx];
      if (!qi) return prev;
      const variants = catalogItemId === qi.catalogItemId
        ? qi.variants
        : qi.alternatives?.find((a) => a.catalogItemId === catalogItemId)?.variants;
      const defaultV = catalogItemId === qi.catalogItemId
        ? qi.defaultVariantName
        : qi.alternatives?.find((a) => a.catalogItemId === catalogItemId)?.defaultVariantName;
      const newVariant = defaultV ?? variants?.[0]?.optionValue ?? "Default";
      return { ...prev, [slotIndex]: newVariant };
    });
  }, [deal]);

  const handleVariantSelect = useCallback((slotIndex: string, variantValue: string) => {
    setSelectedVariants((prev) => ({ ...prev, [slotIndex]: variantValue }));
  }, []);

  const handleConfirm = useCallback(() => {
    const itemSelections: Record<string, string> = {};
    const variantSelections: Record<string, string> = {};

    deal.qualifyingItems.forEach((qi, idx) => {
      const slotKey = String(idx);
      itemSelections[slotKey] = selectedProducts[slotKey] ?? defaultProductSelections[slotKey] ?? qi.catalogItemId;
      variantSelections[slotKey] = selectedVariants[slotKey] ?? defaultVariantSelections[slotKey] ?? "Default";
    });

    onConfirm({ itemSelections, variantSelections });
    onOpenChange(false);
  }, [deal, selectedProducts, selectedVariants, defaultProductSelections, defaultVariantSelections, onConfirm, onOpenChange]);

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
          {deal.qualifyingItems.map((qi, idx) => {
            const slotKey = String(idx);
            const selectedProductId = selectedProducts[slotKey] ?? qi.catalogItemId;
            const showAlternatives = hasAlternatives(qi);
            const availableVariants = getAvailableVariants(qi, selectedProductId);
            const showVariants = availableVariants && availableVariants.length > 1;
            const defaultV = getDefaultVariantName(qi, selectedProductId);
            const selectedVariant = selectedVariants[slotKey] ?? defaultV ?? availableVariants?.[0]?.optionValue ?? "Default";
            const defaultPrice = qi.price ?? 0;

            return (
              <div key={slotKey} className="space-y-3">
                <p className="text-sm font-medium">
                  {qi.quantity}x {qi.name}
                </p>

                {/* Product selection (alternatives) */}
                {showAlternatives && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Choose one
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {/* Primary product */}
                      <button
                        type="button"
                        onClick={() => handleProductSelect(slotKey, qi.catalogItemId)}
                        className={`
                          inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium
                          transition-colors
                          ${
                            selectedProductId === qi.catalogItemId
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:bg-muted"
                          }
                        `}
                      >
                        {selectedProductId === qi.catalogItemId && <Check className="h-3 w-3" />}
                        {qi.name}
                        <span className="text-muted-foreground ml-0.5">
                          {formatCurrency(defaultPrice)}
                        </span>
                      </button>

                      {/* Alternative products */}
                      {qi.alternatives?.map((alt) => {
                        const isSelected = selectedProductId === alt.catalogItemId;
                        const priceDiff = alt.price - defaultPrice;
                        const isUpgrade = priceDiff > 0;

                        return (
                          <button
                            key={alt.catalogItemId}
                            type="button"
                            onClick={() => handleProductSelect(slotKey, alt.catalogItemId)}
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
                            {alt.name}
                            {isUpgrade ? (
                              <span className="text-amber-600 ml-0.5">
                                +{formatCurrency(priceDiff)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground ml-0.5">
                                {formatCurrency(alt.price)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Variant selection (for the selected product) */}
                {showVariants && (
                  <div className="space-y-1.5">
                    {!showAlternatives && (
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Choose variant
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {availableVariants!.map((v) => {
                        const isSelected = selectedVariant === v.optionValue;
                        const priceDiff = v.price - defaultPrice;
                        const isUpgrade = priceDiff > 0;
                        const isSamePrice = priceDiff === 0;

                        return (
                          <button
                            key={v.optionValue}
                            type="button"
                            onClick={() => handleVariantSelect(slotKey, v.optionValue)}
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
                )}

                {/* Info only: single variant, no alternatives */}
                {!showAlternatives && !showVariants && availableVariants?.length === 1 && (
                  <p className="text-xs text-muted-foreground">
                    {availableVariants[0].optionValue} — {formatCurrency(availableVariants[0].price)}
                  </p>
                )}
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
