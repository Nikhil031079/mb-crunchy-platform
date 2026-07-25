import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { InventoryRecord } from "./types";

interface StockAdjustmentDialogProps {
  open: boolean;
  item: InventoryRecord | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (inventoryId: string, adjustment: number, reason: string) => void;
}

export function StockAdjustmentDialog({ open, item, onOpenChange, onConfirm }: StockAdjustmentDialogProps) {
  const formId = useId();
  const [adjustment, setAdjustment] = useState("0");
  const [reason, setReason] = useState("");

  const numericAdjustment = Number(adjustment) || 0;
  const projectedStock = (item?.stockQuantity ?? 0) + numericAdjustment;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!item || numericAdjustment === 0) return;
    onConfirm(item.id, numericAdjustment, reason.trim());
    setAdjustment("0");
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setAdjustment("0"); setReason(""); } onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {item ? `Adjusting stock for "${item.itemName} — ${item.variantName}".` : "Select an item to adjust."}
          </DialogDescription>
        </DialogHeader>

        {item && (
          <>
            <div className="rounded-lg border bg-secondary/50 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Current stock</span><span className="font-medium tabular-nums">{item.stockQuantity}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Reserved</span><span className="tabular-nums">{item.reservedStock}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Available</span><span className="font-medium tabular-nums">{item.availableStock}</span></div>
            </div>

            <form id={formId} className="grid gap-4" onSubmit={handleSubmit}>
              <div className="grid gap-2">
                <Label htmlFor={`${formId}-adj`}>Adjustment</Label>
                <p className="text-xs text-muted-foreground">Use positive numbers to add stock, negative to remove.</p>
                <Input
                  id={`${formId}-adj`}
                  type="number"
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  placeholder="+10 or -5"
                  required
                  autoFocus
                />
              </div>

              <div className="rounded-md border p-2 text-sm text-center">
                Projected stock: <span className="font-medium tabular-nums">{projectedStock}</span>
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`${formId}-reason`}>Reason <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea
                  id={`${formId}-reason`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Physical count correction, damaged goods, supplier delivery…"
                  rows={2}
                />
              </div>
            </form>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {item && <Button type="submit" form={formId} disabled={numericAdjustment === 0}>Apply adjustment</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
