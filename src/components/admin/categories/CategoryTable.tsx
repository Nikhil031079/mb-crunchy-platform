import { ArrowDown, ArrowUp, ArrowUpDown, ImageOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { CategoryRowActions } from "./CategoryRowActions";
import type { Category, CategorySortKey, SortDirection } from "./types";

const statusClassNames = { active: "border-emerald-200 bg-emerald-500/10 text-emerald-700", inactive: "border-amber-200 bg-amber-500/10 text-amber-700", archived: "border-slate-200 bg-slate-500/10 text-slate-700" } as const;

interface CategoryTableProps {
  categories: Category[];
  isLoading?: boolean;
  sortKey: CategorySortKey;
  sortDirection: SortDirection;
  onSort: (key: CategorySortKey) => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  onRestore: (category: Category) => void;
}

function SortButton({ column, label, sortKey, sortDirection, onSort }: { column: CategorySortKey; label: string; sortKey: CategorySortKey; sortDirection: SortDirection; onSort: (key: CategorySortKey) => void }) {
  const isActive = column === sortKey;
  const Icon = isActive ? sortDirection === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" onClick={() => onSort(column)}>{label}<Icon aria-hidden="true" className="size-3.5" /><span className="sr-only">{isActive ? `, sorted ${sortDirection === "asc" ? "ascending" : "descending"}` : ", sort"}</span></Button>;
}

function ImagePreview({ category }: { category: Category }) {
  if (category.imageUrl) return <img className="size-9 rounded-md border object-cover" src={category.imageUrl} alt={`${category.name} image`} />;
  const initials = category.name.split(" ").map((part) => part[0]).join("").slice(0, 2);
  return <div className="flex size-9 items-center justify-center rounded-md border bg-secondary text-xs font-bold text-muted-foreground">{initials || <ImageOff className="size-4" />}</div>;
}

export function CategoryTable({ categories, isLoading = false, sortKey, sortDirection, onSort, onEdit, onDelete, onRestore }: CategoryTableProps) {
  return <Table>
    <TableHeader><TableRow>
      <TableHead>Image</TableHead><TableHead><SortButton column="name" label="Name" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="slug" label="Slug" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="businessUnitName" label="Business Unit" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="status" label="Status" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="displayOrder" label="Display order" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
    </TableRow></TableHeader>
    <TableBody>
      {isLoading ? Array.from({ length: 6 }, (_, index) => <TableRow key={index}><TableCell><Skeleton className="size-9" /></TableCell>{Array.from({ length: 6 }, (_, cellIndex) => <TableCell key={cellIndex}><Skeleton className="h-5 w-24" /></TableCell>)}</TableRow>) : categories.map((category) => <TableRow key={category.id}>
        <TableCell><ImagePreview category={category} /></TableCell><TableCell className="font-medium">{category.name}</TableCell><TableCell className="text-muted-foreground">/{category.slug}</TableCell><TableCell className="text-muted-foreground">{category.businessUnitName}</TableCell><TableCell><Badge variant="outline" className={cn("capitalize", statusClassNames[category.status])}>{category.status}</Badge></TableCell><TableCell>{category.displayOrder}</TableCell><TableCell><CategoryRowActions category={category} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} /></TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
