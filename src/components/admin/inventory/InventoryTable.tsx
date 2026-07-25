import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { InventoryRecord, InventorySortKey, SortDirection } from "./types";

const stockStatusClassNames = {
  in_stock: "border-emerald-200 bg-emerald-500/10 text-emerald-700",
  low_stock: "border-amber-200 bg-amber-500/10 text-amber-700",
  out_of_stock: "border-red-200 bg-red-500/10 text-red-700",
} as const;

const stockStatusLabels = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
} as const;

interface InventoryTableProps {
  items: InventoryRecord[];
  isLoading?: boolean;
  sortKey: InventorySortKey;
  sortDirection: SortDirection;
  onSort: (key: InventorySortKey) => void;
  onAdjust: (item: InventoryRecord) => void;
  onEdit: (item: InventoryRecord) => void;
  onDelete: (item: InventoryRecord) => void;
}

function SortButton({ column, label, sortKey, sortDirection, onSort }: { column: InventorySortKey; label: string; sortKey: InventorySortKey; sortDirection: SortDirection; onSort: (key: InventorySortKey) => void }) {
  const isActive = column === sortKey;
  const Icon = isActive ? (sortDirection === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" onClick={() => onSort(column)}>
      {label}
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{isActive ? `, sorted ${sortDirection === "asc" ? "ascending" : "descending"}` : ", sort"}</span>
    </Button>
  );
}

function StockSkeleton() {
  return (
    <TableRow>
      {Array.from({ length: 9 }, (_, i) => (
        <TableCell key={i}><Skeleton className="h-5 w-20" /></TableCell>
      ))}
    </TableRow>
  );
}

export function InventoryTable({ items, isLoading = false, sortKey, sortDirection, onSort, onAdjust, onEdit, onDelete }: InventoryTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead><SortButton column="itemName" label="Item" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead><SortButton column="variantName" label="Variant" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead><SortButton column="sku" label="SKU" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead className="text-right"><SortButton column="stockQuantity" label="Stock" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead className="text-right"><SortButton column="reservedStock" label="Reserved" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead className="text-right"><SortButton column="availableStock" label="Available" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead><SortButton column="status" label="Status" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead><SortButton column="businessUnitName" label="Business Unit" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead>
          <TableHead><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading
          ? Array.from({ length: 6 }, (_, i) => <StockSkeleton key={i} />)
          : items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.itemName}</TableCell>
              <TableCell className="text-muted-foreground">{item.variantName}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{item.sku || "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{item.stockQuantity}</TableCell>
              <TableCell className="text-right tabular-nums">{item.reservedStock}</TableCell>
              <TableCell className="text-right tabular-nums font-medium">{item.availableStock}</TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("capitalize", stockStatusClassNames[item.status])}>
                  {stockStatusLabels[item.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{item.businessUnitName}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onAdjust(item)} className="h-7 px-2 text-xs">Adjust</Button>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(item)} className="h-7 px-2 text-xs">Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(item)} className="h-7 px-2 text-xs text-destructive">Delete</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
