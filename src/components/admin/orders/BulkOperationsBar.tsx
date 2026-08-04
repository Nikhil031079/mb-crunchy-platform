import { Ban, Banknote, Download, ListChecks, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { OrderRecord } from "./types";
import { canBulkRefund, canCancel } from "./types";

interface BulkOperationsBarProps {
  selectedOrders: OrderRecord[];
  matchingCount: number;
  allMatchingSelected: boolean;
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
  onExportCSV: () => void;
  onUpdateStatus: () => void;
  onCancel: () => void;
  onRefund: () => void;
  isBusy?: boolean;
}

export function BulkOperationsBar({
  selectedOrders,
  matchingCount,
  allMatchingSelected,
  onSelectAllMatching,
  onClearSelection,
  onExportCSV,
  onUpdateStatus,
  onCancel,
  onRefund,
  isBusy = false,
}: BulkOperationsBarProps) {
  const count = selectedOrders.length;
  if (count === 0) return null;

  const cancellable = selectedOrders.filter(canCancel).length;
  const refundable = selectedOrders.filter(canBulkRefund).length;

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2.5"
      role="toolbar"
      aria-label="Bulk order actions"
    >
      <div className="flex items-center gap-2 text-sm">
        <ListChecks aria-hidden="true" className="size-4 text-primary" />
        <span className="font-medium">{count} selected</span>
      </div>
      {!allMatchingSelected && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSelectAllMatching} disabled={isBusy}>
          Select all {matchingCount} matching
        </Button>
      )}
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearSelection} disabled={isBusy}>
        Clear
      </Button>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onUpdateStatus} disabled={isBusy}>
          <RefreshCcw aria-hidden="true" className="size-3.5" />
          Update Status
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive"
          onClick={onCancel}
          disabled={isBusy || cancellable === 0}
          title={cancellable === 0 ? "No selected orders can be cancelled" : undefined}
        >
          <Ban aria-hidden="true" className="size-3.5" />
          Cancel ({cancellable})
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={onRefund}
          disabled={isBusy || refundable === 0}
          title={refundable === 0 ? "No selected orders can be refunded" : undefined}
        >
          <Banknote aria-hidden="true" className="size-3.5" />
          Refund ({refundable})
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onExportCSV} disabled={isBusy}>
          <Download aria-hidden="true" className="size-3.5" />
          Export CSV
        </Button>
      </div>
    </div>
  );
}
