import { UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils";
import type { EnrichedMealDeal } from "@/types";

interface MealDealBadgeProps {
  mealDeal: EnrichedMealDeal;
  onAddMealDeal?: (deal: EnrichedMealDeal) => void;
  compact?: boolean;
}

export function MealDealBadge({ mealDeal, onAddMealDeal, compact }: MealDealBadgeProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onAddMealDeal?.(mealDeal);
  };

  if (compact) {
    return (
      <div className="mt-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <UtensilsCrossed className="h-3 w-3 text-primary shrink-0" />
            <span className="text-[10px] font-medium truncate">{mealDeal.name}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold">{formatCurrency(mealDeal.dealPrice)}</span>
            {mealDeal.savings > 0 && (
              <span className="text-[9px] text-emerald-600 font-medium">
                Save {formatCurrency(mealDeal.savings)}
              </span>
            )}
          </div>
        </div>
        {onAddMealDeal && (
          <Button
            variant="outline"
            size="sm"
            className="mt-1.5 w-full h-6 text-[10px] gap-1"
            onClick={handleClick}
          >
            <UtensilsCrossed className="h-2.5 w-2.5" />
            Add Meal Upgrade
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <UtensilsCrossed className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold">Make it a Meal</span>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {mealDeal.qualifyingItems.map((qi) => (
          <span
            key={qi.catalogItemId}
            className="inline-flex items-center rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium"
          >
            {qi.quantity}x {qi.name}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-bold">{formatCurrency(mealDeal.dealPrice)}</span>
          {mealDeal.savings > 0 && (
            <span className="text-[10px] text-emerald-600 font-medium">
              Save {formatCurrency(mealDeal.savings)}
            </span>
          )}
        </div>
      </div>
      {onAddMealDeal && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={handleClick}
        >
          <UtensilsCrossed className="h-3 w-3" />
          Add Meal Upgrade
        </Button>
      )}
    </div>
  );
}
