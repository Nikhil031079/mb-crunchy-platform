import { CalendarRange, ListFilter, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ORDER_STATUS_OPTIONS } from "@/constants";
import type { OrderFilters, OrderStatus, PaymentStatus } from "./types";
import { PAYMENT_STATUS_LABELS, STATUS_LABELS } from "./types";

interface OrderToolbarProps {
  filters: OrderFilters;
  businessUnits: { id: string; name: string }[];
  onFiltersChange: (filters: OrderFilters) => void;
  onClear: () => void;
}

const statusOptions = ORDER_STATUS_OPTIONS.map((s) => ({
  value: s.value,
  label: STATUS_LABELS[s.value as OrderStatus] ?? s.label,
}));

const paymentOptions = (Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((value) => ({
  value,
  label: PAYMENT_STATUS_LABELS[value],
}));

export function OrderToolbar({ filters, businessUnits, onFiltersChange, onClear }: OrderToolbarProps) {
  const hasFilters =
    filters.query.length > 0 ||
    filters.status !== "all" ||
    filters.paymentStatus !== "all" ||
    filters.businessUnitId !== "all" ||
    filters.orderType !== "all" ||
    filters.dateRange !== null;

  const updateDateRange = (key: "from" | "to", value: string) => {
    const from = key === "from" ? value : (filters.dateRange?.from ?? "");
    const to = key === "to" ? value : (filters.dateRange?.to ?? "");
    onFiltersChange({ ...filters, dateRange: from || to ? { from, to } : null });
  };

  return (
    <div className="border-b p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
            placeholder="Search by order #, customer name, or phone…"
            aria-label="Search orders"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filters.businessUnitId} onValueChange={(v) => onFiltersChange({ ...filters, businessUnitId: v as OrderFilters["businessUnitId"] })}>
            <SelectTrigger aria-label="Filter by business unit" className="w-full sm:w-44">
              <ListFilter aria-hidden="true" className="size-4" />
              <SelectValue placeholder="All business units" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All business units</SelectItem>
              {businessUnits.map((bu) => <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => onFiltersChange({ ...filters, status: v as OrderFilters["status"] })}>
            <SelectTrigger aria-label="Filter by status" className="w-full sm:w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {statusOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.orderType} onValueChange={(v) => onFiltersChange({ ...filters, orderType: v as OrderFilters["orderType"] })}>
            <SelectTrigger aria-label="Filter by type" className="w-full sm:w-36">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
              <SelectItem value="pickup">Pickup</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Select value={filters.paymentStatus} onValueChange={(v) => onFiltersChange({ ...filters, paymentStatus: v as OrderFilters["paymentStatus"] })}>
          <SelectTrigger aria-label="Filter by payment status" className="w-full sm:w-48">
            <SelectValue placeholder="All payment statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payment statuses</SelectItem>
            {paymentOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <CalendarRange aria-hidden="true" className="size-4 text-muted-foreground" />
          <Input
            type="date"
            value={filters.dateRange?.from ?? ""}
            onChange={(e) => updateDateRange("from", e.target.value)}
            aria-label="From date"
            className="w-auto"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={filters.dateRange?.to ?? ""}
            onChange={(e) => updateDateRange("to", e.target.value)}
            aria-label="To date"
            className="w-auto"
          />
        </div>
        {hasFilters && (
          <Button type="button" variant="ghost" size="icon" onClick={onClear} aria-label="Clear filters">
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
