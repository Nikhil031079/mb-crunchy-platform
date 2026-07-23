import { ListFilter, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { CategoryFilters, CategoryStatus } from "./types";

interface CategoryToolbarProps {
  filters: CategoryFilters;
  businessUnits: { id: string; name: string }[];
  onFiltersChange: (filters: CategoryFilters) => void;
  onClear: () => void;
}

export function CategoryToolbar({ filters, businessUnits, onFiltersChange, onClear }: CategoryToolbarProps) {
  const hasFilters = filters.query.length > 0 || filters.status !== "all" || filters.businessUnitId !== "all";

  return (
    <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={filters.query} onChange={(event) => onFiltersChange({ ...filters, query: event.target.value })} placeholder="Search by name or slug…" aria-label="Search categories" className="pl-9" />
      </div>
      <div className="flex gap-2">
        <Select value={filters.businessUnitId} onValueChange={(value) => onFiltersChange({ ...filters, businessUnitId: value as CategoryFilters["businessUnitId"] })}>
          <SelectTrigger aria-label="Filter by business unit" className="w-full sm:w-48">
            <ListFilter aria-hidden="true" className="size-4" />
            <SelectValue placeholder="All business units" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All business units</SelectItem>
            {businessUnits.map((bu) => <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(value) => onFiltersChange({ ...filters, status: value as CategoryStatus | "all" })}>
          <SelectTrigger aria-label="Filter by status" className="w-full sm:w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && <Button type="button" variant="ghost" size="icon" onClick={onClear} aria-label="Clear search and filters"><X className="size-4" /></Button>}
      </div>
    </div>
  );
}
