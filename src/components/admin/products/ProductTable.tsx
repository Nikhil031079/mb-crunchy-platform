import { ArrowDown, ArrowUp, ArrowUpDown, Check, ImageOff, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { ProductRowActions } from "./ProductRowActions";
import type { Product, ProductSortKey, SortDirection } from "./types";

const statusClassNames = { active: "border-emerald-200 bg-emerald-500/10 text-emerald-700", inactive: "border-amber-200 bg-amber-500/10 text-amber-700", archived: "border-slate-200 bg-slate-500/10 text-slate-700" } as const;

interface ProductTableProps {
  products: Product[];
  isLoading?: boolean;
  sortKey: ProductSortKey;
  sortDirection: SortDirection;
  onSort: (key: ProductSortKey) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onRestore: (product: Product) => void;
}

function SortButton({ column, label, sortKey, sortDirection, onSort }: { column: ProductSortKey; label: string; sortKey: ProductSortKey; sortDirection: SortDirection; onSort: (key: ProductSortKey) => void }) {
  const isActive = column === sortKey;
  const Icon = isActive ? sortDirection === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" onClick={() => onSort(column)}>{label}<Icon aria-hidden="true" className="size-3.5" /><span className="sr-only">{isActive ? `, sorted ${sortDirection === "asc" ? "ascending" : "descending"}` : ", sort"}</span></Button>;
}

function ImagePreview({ product }: { product: Product }) {
  if (product.imageUrl) return <img className="size-9 rounded-md border object-cover" src={product.imageUrl} alt={`${product.name} image`} />;
  const initials = product.name.split(" ").map((part) => part[0]).join("").slice(0, 2);
  return <div className="flex size-9 items-center justify-center rounded-md border bg-secondary text-xs font-bold text-muted-foreground">{initials || <ImageOff className="size-4" />}</div>;
}

export function ProductTable({ products, isLoading = false, sortKey, sortDirection, onSort, onEdit, onDelete, onRestore }: ProductTableProps) {
  return <Table>
    <TableHeader><TableRow>
      <TableHead>Image</TableHead><TableHead><SortButton column="name" label="Name" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="slug" label="Slug" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="businessUnitName" label="Business Unit" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="categoryName" label="Category" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="price" label="Price" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead>Featured</TableHead><TableHead>Available</TableHead><TableHead><SortButton column="status" label="Status" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="displayOrder" label="Order" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
    </TableRow></TableHeader>
    <TableBody>
      {isLoading ? Array.from({ length: 6 }, (_, index) => <TableRow key={index}><TableCell><Skeleton className="size-9" /></TableCell>{Array.from({ length: 9 }, (_, cellIndex) => <TableCell key={cellIndex}><Skeleton className="h-5 w-24" /></TableCell>)}</TableRow>) : products.map((product) => <TableRow key={product.id}>
        <TableCell><ImagePreview product={product} /></TableCell><TableCell className="font-medium">{product.name}</TableCell><TableCell className="text-muted-foreground">/{product.slug}</TableCell><TableCell className="text-muted-foreground">{product.businessUnitName}</TableCell><TableCell className="text-muted-foreground">{product.categoryName}</TableCell>        <TableCell className="text-muted-foreground">{product.variants.length > 1 ? <span>₹{Math.min(...product.variants.map((v) => v.price))} – ₹{Math.max(...product.variants.map((v) => v.price))}</span> : product.compareAtPrice ? <span><span className="line-through">{product.compareAtPrice}</span> ₹{product.price}</span> : <span>₹{product.price}</span>}</TableCell><TableCell>{product.featured ? <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><Check aria-hidden="true" className="size-4" />Featured</span> : <span className="text-sm text-muted-foreground">—</span>}</TableCell><TableCell>{product.available ? <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><Check aria-hidden="true" className="size-4" />Yes</span> : <span className="inline-flex items-center gap-1 text-sm text-red-600"><X aria-hidden="true" className="size-4" />No</span>}</TableCell><TableCell><Badge variant="outline" className={cn("capitalize", statusClassNames[product.status])}>{product.status}</Badge></TableCell><TableCell>{product.displayOrder}</TableCell><TableCell><ProductRowActions product={product} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} /></TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
