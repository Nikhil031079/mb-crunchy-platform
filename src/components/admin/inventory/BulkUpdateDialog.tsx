import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

import type { BulkUpdateEntry, InventoryRecord } from "./types";

interface BulkUpdateDialogProps {
  open: boolean;
  items: InventoryRecord[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (updates: { inventoryId: string; stockQuantity: number }[], reason: string) => void;
}

function toEntries(items: InventoryRecord[]): BulkUpdateEntry[] {
  return items.map((item) => ({
    inventoryId: item.id,
    itemName: item.itemName,
    variantName: item.variantName,
    currentStock: item.stockQuantity,
    newStock: item.stockQuantity.toString(),
  }));
}

export function BulkUpdateDialog({ open, items, onOpenChange, onConfirm }: BulkUpdateDialogProps) {
  const formId = useId();
  const [entries, setEntries] = useState<BulkUpdateEntry[]>(() => toEntries(items));
  const [reason, setReason] = useState("");

  const updateEntry = (inventoryId: string, value: string) => {
    setEntries((cur) => cur.map((e) => (e.inventoryId === inventoryId ? { ...e, newStock: value } : e)));
  };

  const changedEntries = entries.filter((e) => {
    const parsed = Number(e.newStock);
    return !isNaN(parsed) && parsed !== e.currentStock;
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (changedEntries.length === 0) return;
    onConfirm(
      changedEntries.map((e) => ({ inventoryId: e.inventoryId, stockQuantity: Number(e.newStock) })),
      reason.trim(),
    );
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setEntries(toEntries(items)); setReason(""); } onOpenChange(o); }}>
      <DialogContent className="max-h-[calc(100vh-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk stock update</DialogTitle>
          <DialogDescription>
            Update stock quantities for {items.length} item{items.length !== 1 ? "s" : ""}. Only changed values will be saved.
          </DialogDescription>
        </DialogHeader>

        <form id={formId} className="grid gap-4" onSubmit={handleSubmit}>
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-3 pr-4">
              {entries.map((entry) => (
                <div key={entry.inventoryId} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{entry.itemName}</p>
                    <p className="text-xs text-muted-foreground">{entry.variantName}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    Current: <span className="tabular-nums">{entry.currentStock}</span>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={entry.newStock}
                    onChange={(e) => updateEntry(entry.inventoryId, e.target.value)}
                    className="w-24 text-right tabular-nums"
                    aria-label={`New stock for ${entry.itemName} ${entry.variantName}`}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="grid gap-2">
            <Label htmlFor={`${formId}-reason`}>Reason <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              id={`${formId}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Weekly inventory count, restocking…"
              rows={2}
            />
          </div>

          {changedEntries.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {changedEntries.length} item{changedEntries.length !== 1 ? "s" : ""} will be updated.
            </p>
          )}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form={formId} disabled={changedEntries.length === 0}>
            Update {changedEntries.length > 0 ? changedEntries.length : ""} item{changedEntries.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
