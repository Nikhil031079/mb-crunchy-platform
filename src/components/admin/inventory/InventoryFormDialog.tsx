import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { InventoryFormValues, InventoryRecord } from "./types";

const emptyValues: InventoryFormValues = {
  catalogItemId: "",
  businessUnitId: "",
  variantName: "",
  sku: "",
  barcode: "",
  stockQuantity: "0",
  lowStockAlert: "",
  costPrice: "",
  supplier: "",
  location: "",
};

interface InventoryFormDialogProps {
  open: boolean;
  item?: InventoryRecord;
  catalogItems: { id: string; name: string; businessUnitId: string }[];
  businessUnits: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InventoryFormValues) => void;
}

function toFormValues(item?: InventoryRecord): InventoryFormValues {
  if (!item) return emptyValues;
  return {
    catalogItemId: item.catalogItemId,
    businessUnitId: item.businessUnitId,
    variantName: item.variantName,
    sku: item.sku ?? "",
    barcode: item.barcode ?? "",
    stockQuantity: item.stockQuantity.toString(),
    lowStockAlert: item.lowStockAlert?.toString() ?? "",
    costPrice: item.costPrice?.toString() ?? "",
    supplier: item.supplier ?? "",
    location: item.location ?? "",
  };
}

export function InventoryFormDialog({ open, item, catalogItems, businessUnits, onOpenChange, onSubmit }: InventoryFormDialogProps) {
  const dialogKey = `${item?.id ?? "new"}-${open ? "open" : "closed"}`;
  const isEditing = Boolean(item);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit inventory" : "Add inventory item"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update stock details for this item." : "Track stock for a catalog item variant."}
          </DialogDescription>
        </DialogHeader>
        <InventoryForm
          key={dialogKey}
          item={item}
          catalogItems={catalogItems}
          businessUnits={businessUnits}
          isEditing={isEditing}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface InventoryFormProps {
  item?: InventoryRecord;
  catalogItems: { id: string; name: string; businessUnitId: string }[];
  businessUnits: { id: string; name: string }[];
  isEditing: boolean;
  onSubmit: (values: InventoryFormValues) => void;
  onCancel: () => void;
}

function InventoryForm({ item, catalogItems, businessUnits, isEditing, onSubmit, onCancel }: InventoryFormProps) {
  const [values, setValues] = useState<InventoryFormValues>(() => toFormValues(item));
  const formId = useId();
  const update = <K extends keyof InventoryFormValues>(key: K, val: InventoryFormValues[K]) =>
    setValues((cur) => ({ ...cur, [key]: val }));

  const filteredCatalogItems = values.businessUnitId
    ? catalogItems.filter((ci) => ci.businessUnitId === values.businessUnitId)
    : catalogItems;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit({
      ...values,
      variantName: values.variantName.trim(),
      sku: values.sku.trim(),
      barcode: values.barcode.trim(),
      supplier: values.supplier.trim(),
      location: values.location.trim(),
    });
  };

  return (
    <>
      <form id={formId} className="grid gap-4" onSubmit={handleSubmit}>
        {/* Business Unit + Catalog Item */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-bu`}>Business Unit</Label>
            <Select value={values.businessUnitId} onValueChange={(v) => { update("businessUnitId", v); update("catalogItemId", ""); }} disabled={isEditing}>
              <SelectTrigger id={`${formId}-bu`}><SelectValue placeholder="Select business unit" /></SelectTrigger>
              <SelectContent>{businessUnits.map((bu) => <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-catalog`}>Catalog Item</Label>
            <Select value={values.catalogItemId} onValueChange={(v) => update("catalogItemId", v)} disabled={isEditing}>
              <SelectTrigger id={`${formId}-catalog`}><SelectValue placeholder={values.businessUnitId ? "Select item" : "Select BU first"} /></SelectTrigger>
              <SelectContent>{filteredCatalogItems.map((ci) => <SelectItem key={ci.id} value={ci.id}>{ci.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Variant Name */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-variant`}>Variant Name</Label>
          <Input id={`${formId}-variant`} value={values.variantName} onChange={(e) => update("variantName", e.target.value)} placeholder="e.g. Default, Large, 500ml" required disabled={isEditing} />
          {isEditing && <p className="text-xs text-muted-foreground">Variant name cannot be changed after creation.</p>}
        </div>

        {/* SKU + Barcode */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-sku`}>SKU <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-sku`} value={values.sku} onChange={(e) => update("sku", e.target.value)} placeholder="e.g. MBK-001" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-barcode`}>Barcode <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-barcode`} value={values.barcode} onChange={(e) => update("barcode", e.target.value)} placeholder="e.g. 8901234567890" />
          </div>
        </div>

        {/* Stock Quantity + Low Stock Alert */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-stock`}>Stock Quantity</Label>
            <Input id={`${formId}-stock`} type="number" min="0" value={values.stockQuantity} onChange={(e) => update("stockQuantity", e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-low`}>Low Stock Alert <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-low`} type="number" min="0" value={values.lowStockAlert} onChange={(e) => update("lowStockAlert", e.target.value)} placeholder="e.g. 10" />
          </div>
        </div>

        {/* Cost Price + Supplier */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-cost`}>Cost Price <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-cost`} type="number" min="0" step="0.01" value={values.costPrice} onChange={(e) => update("costPrice", e.target.value)} placeholder="0.00" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-supplier`}>Supplier <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-supplier`} value={values.supplier} onChange={(e) => update("supplier", e.target.value)} placeholder="Supplier name" />
          </div>
        </div>

        {/* Location */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-location`}>Storage Location <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id={`${formId}-location`} value={values.location} onChange={(e) => update("location", e.target.value)} placeholder="e.g. Shelf A3, Cold Storage" />
        </div>
      </form>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" form={formId}>{isEditing ? "Save changes" : "Add item"}</Button>
      </DialogFooter>
    </>
  );
}
