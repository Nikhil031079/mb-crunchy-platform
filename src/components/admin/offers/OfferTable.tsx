import { ArrowDown, ArrowUp, ArrowUpDown, BadgePercent, Flame, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getOfferMarketingSettings } from "@/utils";

import { OfferRowActions } from "./OfferRowActions";
import type { Offer, OfferSortKey, SortDirection } from "./types";

const statusClassNames = { active: "border-emerald-200 bg-emerald-500/10 text-emerald-700", inactive: "border-amber-200 bg-amber-500/10 text-amber-700", archived: "border-slate-200 bg-slate-500/10 text-slate-700" } as const;

function formatTimestamp(ts: number) {
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDiscount(type: string, value: number, maxDiscount?: number) {
  const base = type === "percentage" ? `${value}% off` : `₹${value} off`;
  return maxDiscount && type === "percentage" ? `${base} (max ₹${maxDiscount})` : base;
}

interface OfferTableProps {
  offers: Offer[];
  isLoading?: boolean;
  sortKey: OfferSortKey;
  sortDirection: SortDirection;
  onSort: (key: OfferSortKey) => void;
  onEdit: (offer: Offer) => void;
  onDelete: (offer: Offer) => void;
  onRestore: (offer: Offer) => void;
}

function SortButton({ column, label, sortKey, sortDirection, onSort }: { column: OfferSortKey; label: string; sortKey: OfferSortKey; sortDirection: SortDirection; onSort: (key: OfferSortKey) => void }) {
  const isActive = column === sortKey;
  const Icon = isActive ? sortDirection === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" onClick={() => onSort(column)}>{label}<Icon aria-hidden="true" className="size-3.5" /><span className="sr-only">{isActive ? `, sorted ${sortDirection === "asc" ? "ascending" : "descending"}` : ", sort"}</span></Button>;
}

function ImagePreview({ offer }: { offer: Offer }) {
  if (offer.banner) return <img className="size-9 rounded-md border object-cover" src={offer.banner} alt={`${offer.title} banner`} />;
  return <div className="flex size-9 items-center justify-center rounded-md border bg-secondary text-xs font-bold text-muted-foreground"><BadgePercent className="size-4" /></div>;
}

function MarketingBadges({ offer }: { offer: Offer }) {
  const settings = getOfferMarketingSettings(offer);
  if (!settings.featured && !settings.isFlashSale && !settings.flashSaleFeatured) return null;
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1">
      {settings.isFlashSale && (
        <Badge variant="outline" className="border-orange-200 bg-orange-500/10 px-1 py-0 text-[10px] font-medium text-orange-600">
          <Flame className="size-3" />Flash
        </Badge>
      )}
      {settings.featured && (
        <Badge variant="outline" className="border-amber-200 bg-amber-500/10 px-1 py-0 text-[10px] font-medium text-amber-600">
          <Star className="size-3" />Featured
        </Badge>
      )}
    </div>
  );
}

export function OfferTable({ offers, isLoading = false, sortKey, sortDirection, onSort, onEdit, onDelete, onRestore }: OfferTableProps) {
  return <Table>
    <TableHeader><TableRow>
      <TableHead>Banner</TableHead><TableHead><SortButton column="title" label="Title" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="code" label="Code" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="businessUnitName" label="Business Unit" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="discountValue" label="Discount" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead>Min Order</TableHead><TableHead>Usage</TableHead><TableHead>Dates</TableHead><TableHead><SortButton column="status" label="Status" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><SortButton column="displayOrder" label="Order" sortKey={sortKey} sortDirection={sortDirection} onSort={onSort} /></TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
    </TableRow></TableHeader>
    <TableBody>
      {isLoading ? Array.from({ length: 6 }, (_, index) => <TableRow key={index}><TableCell><Skeleton className="size-9" /></TableCell>{Array.from({ length: 9 }, (_, cellIndex) => <TableCell key={cellIndex}><Skeleton className="h-5 w-24" /></TableCell>)}</TableRow>) : offers.map((offer) => <TableRow key={offer.id}>
        <TableCell><ImagePreview offer={offer} /></TableCell><TableCell className="font-medium"><div className="min-w-0"><p className="truncate">{offer.title}</p><MarketingBadges offer={offer} /></div></TableCell><TableCell className="text-muted-foreground">{offer.code ? <Badge variant="secondary" className="font-mono">{offer.code}</Badge> : <span className="text-muted-foreground italic">Auto</span>}</TableCell><TableCell className="text-muted-foreground">{offer.businessUnitName}</TableCell><TableCell><Badge variant="outline" className="border-emerald-200 bg-emerald-500/10 text-emerald-700">{formatDiscount(offer.discountType, offer.discountValue, offer.maxDiscount)}</Badge></TableCell><TableCell className="text-muted-foreground">{offer.minOrderValue ? `₹${offer.minOrderValue}` : "—"}</TableCell><TableCell className="text-muted-foreground">{offer.usedCount}{offer.usageLimit ? ` / ${offer.usageLimit}` : ""}</TableCell><TableCell className="text-muted-foreground">{formatTimestamp(offer.startsAt)} — {formatTimestamp(offer.endsAt)}</TableCell><TableCell><Badge variant="outline" className={cn("capitalize", statusClassNames[offer.status])}>{offer.status}</Badge></TableCell><TableCell>{offer.displayOrder}</TableCell><TableCell><OfferRowActions offer={offer} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} /></TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}
