import { AdminFilterSelect, AdminSearch, type AdminFilterOption } from "@/components/admin/design-system/AdminInputs";
import { contentTypes, contentTypeLabels, bannerStatuses } from "./types";
import type { BannerFilters, ContentType, BannerStatus } from "./types";

const statusOptions: AdminFilterOption[] = [
  { value: "all", label: "All Statuses" },
  ...bannerStatuses.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
];

const contentTypeOptions: AdminFilterOption[] = [
  { value: "all", label: "All Types" },
  ...contentTypes.map((ct) => ({ value: ct, label: contentTypeLabels[ct] })),
];

interface BannerToolbarProps {
  filters: BannerFilters;
  businessUnits: { id: string; name: string }[];
  onFiltersChange: (filters: BannerFilters) => void;
  onClear: () => void;
}

export function BannerToolbar({ filters, businessUnits, onFiltersChange, onClear }: BannerToolbarProps) {
  const buOptions: AdminFilterOption[] = [
    { value: "all", label: "All Stores" },
    ...businessUnits.map((bu) => ({ value: bu.id, label: bu.name })),
  ];

  return (
    <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
      <AdminSearch
        placeholder="Search banners..."
        value={filters.query}
        onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
        className="w-full sm:max-w-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <AdminFilterSelect
          value={filters.status}
          onValueChange={(v) => onFiltersChange({ ...filters, status: v as BannerStatus | "all" })}
          options={statusOptions}
          placeholder="Status"
          label="Filter by status"
        />
        <AdminFilterSelect
          value={filters.contentType}
          onValueChange={(v) => onFiltersChange({ ...filters, contentType: v as ContentType | "all" })}
          options={contentTypeOptions}
          placeholder="Type"
          label="Filter by content type"
        />
        <AdminFilterSelect
          value={filters.businessUnitId}
          onValueChange={(v) => onFiltersChange({ ...filters, businessUnitId: v })}
          options={buOptions}
          placeholder="Store"
          label="Filter by store"
        />
        {(filters.query || filters.status !== "all" || filters.contentType !== "all" || filters.businessUnitId !== "all") && (
          <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
