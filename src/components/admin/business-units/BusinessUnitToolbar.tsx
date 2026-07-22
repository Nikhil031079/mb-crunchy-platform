import { ListFilter, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { BusinessUnitStatus } from "./types";

interface BusinessUnitToolbarProps {
  query: string;
  status: BusinessUnitStatus | "all";
  onQueryChange: (query: string) => void;
  onStatusChange: (status: BusinessUnitStatus | "all") => void;
  onClear: () => void;
}

export function BusinessUnitToolbar({ query, status, onQueryChange, onStatusChange, onClear }: BusinessUnitToolbarProps) {
  const hasFilters = query.length > 0 || status !== "all";

  return (
    <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search by name or slug…" aria-label="Search business units" className="pl-9" />
      </div>
      <div className="flex gap-2">
        <Select value={status} onValueChange={(value) => onStatusChange(value as BusinessUnitStatus | "all") }>
          <SelectTrigger aria-label="Filter by status" className="w-full sm:w-40">
            <ListFilter aria-hidden="true" className="size-4" />
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
