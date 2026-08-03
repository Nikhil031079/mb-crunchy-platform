import { Archive, ChevronDown, ChevronUp, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getCampaignWindowStatus } from "@/utils";

import { sectionTypeLabels } from "./types";
import type { HomepageSectionRow } from "./types";

interface HomepageSectionTableProps {
  rows: HomepageSectionRow[];
  isLoading?: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onToggleVisible: (row: HomepageSectionRow, visible: boolean) => void;
  onPreview: (row: HomepageSectionRow) => void;
  onEdit: (row: HomepageSectionRow) => void;
  onDelete: (row: HomepageSectionRow) => void;
}

function LoadingRows() {
  return Array.from({ length: 6 }).map((_, i) => (
    <TableRow key={`skeleton-${i}`}>
      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
      <TableCell className="w-12" />
    </TableRow>
  ));
}

function ScheduleBadge({ startDate, endDate }: { startDate?: number; endDate?: number }) {
  const window = getCampaignWindowStatus(startDate, endDate);
  const map: Record<string, { label: string; className: string }> = {
    none: { label: "Always on", className: "border-emerald-200 bg-emerald-500/10 text-emerald-700" },
    active: { label: "Live now", className: "border-emerald-200 bg-emerald-500/10 text-emerald-700" },
    scheduled: { label: "Scheduled", className: "border-amber-200 bg-amber-500/10 text-amber-700" },
    expired: { label: "Expired", className: "border-red-200 bg-red-500/10 text-red-700" },
  };
  const status = map[window];

  return <Badge variant="outline" className={cn("text-xs", status.className)}>{status.label}</Badge>;
}

export function HomepageSectionTable({
  rows,
  isLoading,
  onMove,
  onToggleVisible,
  onPreview,
  onEdit,
  onDelete,
}: HomepageSectionTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Order</TableHead>
            <TableHead>Section</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Visible</TableHead>
            <TableHead className="w-40"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <LoadingRows />
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                No sections yet. Click &quot;Add section&quot; to build your homepage.
              </TableCell>
            </TableRow>
          ) : rows.map((row, index) => (
            <TableRow key={row.sectionType} className={cn(!row.visible && "opacity-60")}>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0}
                    onClick={() => onMove(index, -1)}
                    aria-label={`Move ${sectionTypeLabels[row.sectionType]} up`}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">{row.displayOrder}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === rows.length - 1}
                    onClick={() => onMove(index, 1)}
                    aria-label={`Move ${sectionTypeLabels[row.sectionType]} down`}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                <div className="min-w-0">
                  <p className="font-medium">{sectionTypeLabels[row.sectionType]}</p>
                  {row.title && <p className="truncate text-xs text-muted-foreground">{row.title}</p>}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {row.target === "both" ? "Both Stores" : row.target}
                </Badge>
              </TableCell>
              <TableCell><ScheduleBadge startDate={row.startDate} endDate={row.endDate} /></TableCell>
              <TableCell>
                <Switch
                  checked={row.visible}
                  onCheckedChange={(checked) => onToggleVisible(row, checked)}
                  aria-label={`Toggle ${sectionTypeLabels[row.sectionType]} visibility`}
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => onPreview(row)}>
                    <Eye className="size-3.5" />Preview
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => onEdit(row)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(row)} aria-label={`Delete ${sectionTypeLabels[row.sectionType]}`}>
                    <Archive className="size-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
