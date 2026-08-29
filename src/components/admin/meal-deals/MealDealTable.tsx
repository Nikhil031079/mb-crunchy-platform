import { ArrowUpDown, RotateCcw, Trash2, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { MealDealRecord, MealDealSortKey, SortDirection } from "./types";

const statusClassNames: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  inactive: "bg-amber-500/10 text-amber-600 border-amber-200",
};

interface MealDealTableProps {
  mealDeals: MealDealRecord[];
  isLoading?: boolean;
  sortKey: MealDealSortKey;
  sortDirection: SortDirection;
  onSort: (key: MealDealSortKey) => void;
  onEdit: (mealDeal: MealDealRecord) => void;
  onDelete: (mealDeal: MealDealRecord) => void;
  onRestore: (mealDeal: MealDealRecord) => void;
}

function SortHeader({
  label,
  sortKey,
  currentSortKey,
  sortDirection,
  onSort,
}: {
  label: string;
  sortKey: MealDealSortKey;
  currentSortKey: MealDealSortKey;
  sortDirection: SortDirection;
  onSort: (key: MealDealSortKey) => void;
}) {
  const isActive = sortKey === currentSortKey;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 data-[state=open]:bg-accent -ml-1.5 text-xs font-medium"
      onClick={() => onSort(sortKey)}
    >
      {label}
      <ArrowUpDown
        className={`ml-1 h-3 w-3 ${isActive ? "text-foreground" : "text-muted-foreground/50"}`}
      />
      {isActive && (
        <span className="sr-only">
          {sortDirection === "asc" ? "(sorted ascending)" : "(sorted descending)"}
        </span>
      )}
    </Button>
  );
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);

export function MealDealTable({
  mealDeals,
  isLoading,
  sortKey,
  sortDirection,
  onSort,
  onEdit,
  onDelete,
  onRestore,
}: MealDealTableProps) {
  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Loading meal deals...
      </div>
    );
  }

  if (mealDeals.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <SortHeader label="#" sortKey="displayOrder" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
            </TableHead>
            <TableHead>
              <SortHeader label="Name" sortKey="name" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
            </TableHead>
            <TableHead>Business Unit</TableHead>
            <TableHead>
              <SortHeader label="Price" sortKey="dealPrice" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
            </TableHead>
            <TableHead>Qualifying Items</TableHead>
            <TableHead>Apply To</TableHead>
            <TableHead>Cart Detection</TableHead>
            <TableHead>
              <SortHeader label="Status" sortKey="status" currentSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
            </TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mealDeals.map((deal) => (
            <TableRow key={deal.id}>
              <TableCell className="text-muted-foreground">{deal.displayOrder}</TableCell>
              <TableCell className="font-medium">{deal.name}</TableCell>
              <TableCell className="text-muted-foreground">{deal.businessUnitName}</TableCell>
              <TableCell className="font-medium">{formatCurrency(deal.dealPrice)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {deal.qualifyingItems.map((qi, i) => (
                    <span
                      key={`${qi.catalogItemId}-${i}`}
                      className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium"
                    >
                      {qi.quantity}x item
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {deal.applyToCombos && (
                    <span className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                      Combos
                    </span>
                  )}
                  {deal.applyToPartyPacks && (
                    <span className="inline-flex items-center rounded-md bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                      Party Packs
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className={`text-xs ${deal.cartSmartDetection ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {deal.cartSmartDetection ? "Enabled" : "Disabled"}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("capitalize", statusClassNames[deal.status])}>
                  {deal.status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onEdit(deal)}
                    aria-label={`Edit ${deal.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {deal.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(deal)}
                      aria-label={`Archive ${deal.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-emerald-600"
                      onClick={() => onRestore(deal)}
                      aria-label={`Restore ${deal.name}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
