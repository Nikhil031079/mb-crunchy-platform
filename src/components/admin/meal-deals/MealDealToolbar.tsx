import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { MealDealFilters } from "./types";

interface BusinessUnitOption {
  id: string;
  name: string;
}

interface MealDealToolbarProps {
  filters: MealDealFilters;
  businessUnits: BusinessUnitOption[];
  onFiltersChange: (filters: MealDealFilters) => void;
  onClear: () => void;
}

export function MealDealToolbar({
  filters,
  businessUnits,
  onFiltersChange,
  onClear,
}: MealDealToolbarProps) {
  const hasActiveFilters =
    filters.query !== "" || filters.status !== "all" || filters.businessUnitId !== "all";

  return (
    <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search meal deals..."
          className="pl-8"
          value={filters.query}
          onChange={(e) =>
            onFiltersChange({ ...filters, query: e.target.value })
          }
        />
      </div>

      {/* Status filter */}
      <Select
        value={filters.status}
        onValueChange={(v) =>
          onFiltersChange({ ...filters, status: v as MealDealFilters["status"] })
        }
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>

      {/* Business Unit filter */}
      <Select
        value={filters.businessUnitId}
        onValueChange={(v) =>
          onFiltersChange({ ...filters, businessUnitId: v })
        }
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Business Unit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Business Units</SelectItem>
          {businessUnits.map((bu) => (
            <SelectItem key={bu.id} value={bu.id}>
              {bu.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear filters */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
