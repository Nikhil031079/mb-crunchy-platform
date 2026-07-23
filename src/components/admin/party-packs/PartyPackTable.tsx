import { ArrowDown, ArrowUp, ArrowUpDown, Check, ImageOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { PartyPackRowActions } from "./PartyPackRowActions";
import type { PartyPack, PartyPackSortKey, SortDirection } from "./types";

const statusClassNames = { active: "border-emerald-200 bg-emerald-500/10 text-emerald-700", inactive: "border-amber-200 bg-amber-500/10 text-amber-700", archived: "border-slate-200 bg-slate-500/10 text-slate-700" } as const;

interface PartyPackTableProps {
  partyPacks: PartyPack[];
  isLoading?: boolean;
  sortKey: PartyPackSortKey;
  sortDirection: SortDirection;
  onSort: (key: PartyPackSortKey) => void;
  onEdit: (partyPack: PartyPack) => void;
  onDelete: (partyPack: PartyPack) => void;
  onRestore: (partyPack: PartyPack) => void;
}

function SortButton({ column, label, sortKey, sortDirection, onSort }: { column: PartyPackSortKey; label: string; sortKey: PartyPackSortKey; sortDirection: SortDirection; onSort: (key: PartyPackSortKey) => void }) {
  const isActive = column === sortKey;
  const Icon = isActive ? sortDirection === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" onClick={() => onSort(column)}>{label}<Icon aria-hidden="true" className="size-3.5" /><span className="sr-only">{isActive ? `, sorted ${sortDirection === "asc" ? "ascending" : "descending"}` : ", sort"}</span></Button>;
}

function ImagePreview({ partyPack }: { partyPack: PartyPack }) {
  if (partyPack.imageUrl) return <img className="size-9 rounded-md border object-cover" src={partyPack.imageUrl} alt={`${partyPack.name} image`} />;
  const initials = partyPack.name.split(" ").map((part) => part[0]).join("").slice(0, 2);
  return <div className="flex size-9 items-center justify-center rounded-md border bg-secondary text-xs font-bold text-muted-foreground">{initials || <ImageOff className="size-4" />}</div>;
}

export function PartyPackTable({ partyPacks, isLoading = false, sortKey, sortDirection, onSort, onEdit, onDelete, onRestore }: PartyPackTableProps) {
  return <Table>
    <TableHeader><TableRow>
      <TableHead>Image</TableHead><TableHead><SortButton column="name" label="Name" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="slug" label="Slug" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="businessUnitName" label="Business Unit" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead>Items</TableHead><TableHead>Servings</TableHead><TableHead><SortButton column="price" label="Price" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead>Featured</TableHead><TableHead><SortButton column="status" label="Status" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="displayOrder" label="Order" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
    </TableRow></TableHeader>
    <TableBody>
      {isLoading ? Array.from({ length: 6 }, (_, index) => <TableRow key={index}><TableCell><Skeleton className="size-9" /></TableCell>{Array.from({ length: 9 }, (_, cellIndex) => <TableCell key={cellIndex}><Skeleton className="h-5 w-24" /></TableCell>)}</TableRow>) : partyPacks.map((pack) => <TableRow key={pack.id}>
        <TableCell><ImagePreview partyPack={pack} /></TableCell><TableCell className="font-medium">{pack.name}</TableCell><TableCell className="text-muted-foreground">/{pack.slug}</TableCell><TableCell className="text-muted-foreground">{pack.businessUnitName}</TableCell><TableCell className="text-muted-foreground">{pack.items.length} item{pack.items.length !== 1 ? "s" : ""}</TableCell><TableCell className="text-muted-foreground">{pack.minServings}–{pack.maxServings}</TableCell><TableCell className="text-muted-foreground">{pack.compareAtPrice ? <span><span className="line-through">{pack.compareAtPrice}</span> ₹{pack.price}</span> : <span>₹{pack.price}</span>}</TableCell><TableCell>{pack.featured ? <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><Check aria-hidden="true" className="size-4" />Featured</span> : <span className="text-sm text-muted-foreground">—</span>}</TableCell><TableCell><Badge variant="outline" className={cn("capitalize", statusClassNames[pack.status])}>{pack.status}</Badge></TableCell><TableCell>{pack.displayOrder}</TableCell><TableCell><PartyPackRowActions partyPack={pack} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} /></TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
