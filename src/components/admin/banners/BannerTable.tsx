import { ArrowUpDown, Image, MoreHorizontal, Pencil, Archive, ArchiveRestore } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { contentTypeLabels } from "./types";
import type { Banner, BannerSortKey, SortDirection } from "./types";

interface BannerTableProps {
  banners: Banner[];
  isLoading?: boolean;
  sortKey: BannerSortKey;
  sortDirection: SortDirection;
  onSort: (key: BannerSortKey) => void;
  onEdit: (banner: Banner) => void;
  onDelete: (banner: Banner) => void;
  onRestore: (banner: Banner) => void;
}

const statusColor: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  inactive: "bg-amber-500/10 text-amber-600 border-amber-200",
  archived: "bg-gray-500/10 text-gray-600 border-gray-200",
};

function SortHeader({ label, sortKey, currentKey, direction, onSort }: { label: string; sortKey: BannerSortKey; currentKey: BannerSortKey; direction: SortDirection; onSort: (key: BannerSortKey) => void }) {
  return (
    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-medium" onClick={() => onSort(sortKey)}>
      {label}
      <ArrowUpDown className={cn("ml-1 h-3 w-3", currentKey === sortKey ? "text-foreground" : "text-muted-foreground")} />
      {currentKey === sortKey && <span className="sr-only">{direction === "asc" ? "ascending" : "descending"}</span>}
    </Button>
  );
}

function LoadingRows() {
  return Array.from({ length: 5 }).map((_, i) => (
    <TableRow key={`skeleton-${i}`}>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell className="w-12" />
    </TableRow>
  ));
}

export function BannerTable({ banners, isLoading, sortKey, sortDirection, onSort, onEdit, onDelete, onRestore }: BannerTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><SortHeader label="Title" sortKey="title" currentKey={sortKey} direction={sortDirection} onSort={onSort} /></TableHead>
            <TableHead><SortHeader label="Type" sortKey="contentType" currentKey={sortKey} direction={sortDirection} onSort={onSort} /></TableHead>
            <TableHead><SortHeader label="Status" sortKey="status" currentKey={sortKey} direction={sortDirection} onSort={onSort} /></TableHead>
            <TableHead><SortHeader label="Order" sortKey="displayOrder" currentKey={sortKey} direction={sortDirection} onSort={onSort} /></TableHead>
            <TableHead>Store</TableHead>
            <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? <LoadingRows /> : banners.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                No banners found.
              </TableCell>
            </TableRow>
          ) : banners.map((banner) => (
            <TableRow key={banner.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    {banner.imageUrl ? (
                      <img src={banner.imageUrl} alt="" className="h-full w-full rounded-lg object-cover" />
                    ) : (
                      <Image className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{banner.title}</p>
                    {banner.subtitle && <p className="text-xs text-muted-foreground truncate">{banner.subtitle}</p>}
                  </div>
                </div>
              </TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{contentTypeLabels[banner.contentType]}</Badge></TableCell>
              <TableCell><Badge variant="outline" className={cn("text-xs capitalize", statusColor[banner.status])}>{banner.status}</Badge></TableCell>
              <TableCell className="text-sm">{banner.displayOrder}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{banner.businessUnitName ?? "Global"}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(banner)}>
                      <Pencil className="mr-2 h-4 w-4" />Edit
                    </DropdownMenuItem>
                    {banner.status === "archived" ? (
                      <DropdownMenuItem onClick={() => onRestore(banner)}>
                        <ArchiveRestore className="mr-2 h-4 w-4" />Restore
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => onDelete(banner)} className="text-destructive">
                        <Archive className="mr-2 h-4 w-4" />Archive
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
