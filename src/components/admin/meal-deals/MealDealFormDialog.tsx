import { useEffect, useMemo, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

import type { MealDealFormValues, AdminQualifyingItem } from "./types";

interface CatalogItemOption {
  id: string;
  businessUnitId: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  itemType: string;
}

interface BusinessUnitOption {
  id: string;
  name: string;
}

interface MealDealFormDialogProps {
  open: boolean;
  mealDeal?: MealDealFormValues & { id?: string };
  businessUnits: BusinessUnitOption[];
  catalogItems: CatalogItemOption[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: MealDealFormValues) => void;
}

const emptyValues: MealDealFormValues = {
  businessUnitId: "",
  name: "",
  status: "active",
  dealPrice: 0,
  qualifyingItems: [{ catalogItemId: "", quantity: 1 }],
  applyToCombos: true,
  applyToPartyPacks: true,
  parentCatalogItemIds: [],
  cartSmartDetection: true,
  displayOrder: 0,
};

function toFormValues(mealDeal: MealDealFormValues & { id?: string }): MealDealFormValues {
  return {
    businessUnitId: mealDeal.businessUnitId,
    name: mealDeal.name,
    status: mealDeal.status,
    dealPrice: mealDeal.dealPrice,
    qualifyingItems: mealDeal.qualifyingItems.length > 0
      ? mealDeal.qualifyingItems
      : [{ catalogItemId: "", quantity: 1 }],
    applyToCombos: mealDeal.applyToCombos,
    applyToPartyPacks: mealDeal.applyToPartyPacks,
    parentCatalogItemIds: mealDeal.parentCatalogItemIds ?? [],
    cartSmartDetection: mealDeal.cartSmartDetection,
    displayOrder: mealDeal.displayOrder,
  };
}

export function MealDealFormDialog({
  open,
  mealDeal,
  businessUnits,
  catalogItems,
  onOpenChange,
  onSubmit,
}: MealDealFormDialogProps) {
  const formId = useId();
  const isEditing = Boolean(mealDeal?.id);
  const dialogKey = `${mealDeal?.id ?? "new"}-${open ? "open" : "closed"}`;

  const [values, setValues] = useState<MealDealFormValues>(emptyValues);

  useEffect(() => {
    if (open) {
      setValues(mealDeal ? toFormValues(mealDeal) : { ...emptyValues, businessUnitId: businessUnits[0]?.id ?? "" });
    }
  }, [open, mealDeal, businessUnits]);

  const update = <K extends keyof MealDealFormValues>(key: K, value: MealDealFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const eligibleItems = useMemo(
    () =>
      catalogItems.filter(
        (ci) =>
          ci.itemType === "product" &&
          (!values.businessUnitId || ci.businessUnitId === values.businessUnitId)
      ),
    [catalogItems, values.businessUnitId]
  );

  const usedItemIds = useMemo(
    () => new Set(values.qualifyingItems.map((qi) => qi.catalogItemId).filter(Boolean)),
    [values.qualifyingItems]
  );

  // Parent catalog items — combos and/or party packs from the selected BU.
  const parentItems = useMemo(() => {
    if (!values.businessUnitId) return [];
    const allowedTypes = new Set<string>();
    if (values.applyToCombos) allowedTypes.add("combo");
    if (values.applyToPartyPacks) allowedTypes.add("partyPack");
    if (allowedTypes.size === 0) return [];
    return catalogItems.filter(
      (ci) =>
        ci.businessUnitId === values.businessUnitId &&
        allowedTypes.has(ci.itemType),
    );
  }, [catalogItems, values.businessUnitId, values.applyToCombos, values.applyToPartyPacks]);

  const selectedParentIds = values.parentCatalogItemIds ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.businessUnitId || !values.name.trim() || values.dealPrice <= 0) return;
    if (values.qualifyingItems.some((qi) => !qi.catalogItemId || qi.quantity < 1)) return;
    onSubmit(values);
  };

  const addQualifyingItem = () => {
    setValues((prev) => ({
      ...prev,
      qualifyingItems: [...prev.qualifyingItems, { catalogItemId: "", quantity: 1, alternatives: [] }],
    }));
  };

  const removeQualifyingItem = (index: number) => {
    setValues((prev) => ({
      ...prev,
      qualifyingItems: prev.qualifyingItems.filter((_, i) => i !== index),
    }));
  };

  const updateQualifyingItem = (index: number, field: "catalogItemId" | "quantity", value: string | number) => {
    setValues((prev) => ({
      ...prev,
      qualifyingItems: prev.qualifyingItems.map((qi, i) =>
        i === index ? { ...qi, [field]: value } : qi
      ),
    }));
  };

  const addAlternative = (qiIndex: number, altCatalogItemId: string) => {
    setValues((prev) => ({
      ...prev,
      qualifyingItems: prev.qualifyingItems.map((qi, i) => {
        if (i !== qiIndex) return qi;
        const existing = qi.alternatives ?? [];
        if (existing.includes(altCatalogItemId)) return qi;
        if (altCatalogItemId === qi.catalogItemId) return qi;
        return { ...qi, alternatives: [...existing, altCatalogItemId] };
      }),
    }));
  };

  const removeAlternative = (qiIndex: number, altCatalogItemId: string) => {
    setValues((prev) => ({
      ...prev,
      qualifyingItems: prev.qualifyingItems.map((qi, i) => {
        if (i !== qiIndex) return qi;
        return { ...qi, alternatives: (qi.alternatives ?? []).filter((id) => id !== altCatalogItemId) };
      }),
    }));
  };

  // Calculate individual total from selected qualifying items
  const individualTotal = useMemo(() => {
    return values.qualifyingItems.reduce((sum, qi) => {
      const item = eligibleItems.find((ei) => ei.id === qi.catalogItemId);
      return sum + (item ? item.price * qi.quantity : 0);
    }, 0);
  }, [values.qualifyingItems, eligibleItems]);

  const savings = individualTotal - values.dealPrice;

  // Clear parentCatalogItemIds when BU changes to a value that doesn't
  // contain the previously selected parents.
  const handleBuChange = (newBuId: string) => {
    update("businessUnitId", newBuId);
    // Clear parents that don't belong to the new BU.
    const validIds = catalogItems
      .filter((ci) => ci.businessUnitId === newBuId)
      .map((ci) => ci.id);
    const filtered = (values.parentCatalogItemIds ?? []).filter((id) =>
      validIds.includes(id),
    );
    update("parentCatalogItemIds", filtered);
  };

  // When Apply-To toggles change, remove parents whose itemType is now excluded.
  const handleApplyToCombosChange = (checked: boolean) => {
    update("applyToCombos", checked);
    if (!checked) {
      // Remove all combo IDs from selection.
      const comboIds = new Set(
        catalogItems
          .filter((ci) => ci.itemType === "combo")
          .map((ci) => ci.id),
      );
      update(
        "parentCatalogItemIds",
        (values.parentCatalogItemIds ?? []).filter((id) => !comboIds.has(id)),
      );
    }
  };

  const handleApplyToPartyPacksChange = (checked: boolean) => {
    update("applyToPartyPacks", checked);
    if (!checked) {
      // Remove all party pack IDs from selection.
      const ppIds = new Set(
        catalogItems
          .filter((ci) => ci.itemType === "partyPack")
          .map((ci) => ci.id),
      );
      update(
        "parentCatalogItemIds",
        (values.parentCatalogItemIds ?? []).filter((id) => !ppIds.has(id)),
      );
    }
  };

  // Toggle a parent in/out of selection.
  const toggleParent = (id: string) => {
    const current = values.parentCatalogItemIds ?? [];
    if (current.includes(id)) {
      update(
        "parentCatalogItemIds",
        current.filter((pid) => pid !== id),
      );
    } else {
      update("parentCatalogItemIds", [...current, id]);
    }
  };

  const clearParents = () => update("parentCatalogItemIds", []);

  return (
    <Dialog key={dialogKey} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Meal Deal" : "Create Meal Deal"}</DialogTitle>
          <DialogDescription>
            Configure a meal deal that bundles qualifying products at a discounted price.
          </DialogDescription>
        </DialogHeader>

        <form id={formId} onSubmit={handleSubmit} className="space-y-6">
          {/* Business Unit */}
          <div className="space-y-2">
            <Label htmlFor="businessUnitId">Business Unit</Label>
            <Select
              value={values.businessUnitId}
              onValueChange={handleBuChange}
              disabled={isEditing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select business unit" />
              </SelectTrigger>
              <SelectContent>
                {businessUnits.map((bu) => (
                  <SelectItem key={bu.id} value={bu.id}>
                    {bu.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Deal Name</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. Meal Upgrade"
              required
            />
          </div>

          {/* Status + Deal Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={values.status}
                onValueChange={(v) => update("status", v as "active" | "inactive")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dealPrice">Deal Price</Label>
              <Input
                id="dealPrice"
                type="number"
                min="1"
                step="1"
                value={values.dealPrice}
                onChange={(e) => update("dealPrice", Number(e.target.value))}
                required
              />
            </div>
          </div>

          {/* Qualifying Products */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Qualifying Products</Label>
              <Button type="button" variant="outline" size="sm" onClick={addQualifyingItem}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>
            <div className="space-y-3">
              {values.qualifyingItems.map((qi, index) => {
                const altItems = (qi.alternatives ?? [])
                  .map((altId) => eligibleItems.find((ei) => ei.id === altId))
                  .filter(Boolean);
                const usedAltIds = new Set([
                  qi.catalogItemId,
                  ...(qi.alternatives ?? []),
                ]);
                const availableForAlt = eligibleItems.filter(
                  (ei) => !usedAltIds.has(ei.id),
                );

                return (
                  <div key={index} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Select
                        value={qi.catalogItemId}
                        onValueChange={(v) => updateQualifyingItem(index, "catalogItemId", v)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleItems
                            .filter((ei) => ei.id === qi.catalogItemId || !usedItemIds.has(ei.id))
                            .map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name} — {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(item.price)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="1"
                        className="w-20"
                        value={qi.quantity}
                        onChange={(e) => updateQualifyingItem(index, "quantity", Number(e.target.value))}
                      />
                      {values.qualifyingItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeQualifyingItem(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {/* Alternatives */}
                    {altItems.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-1">
                        {altItems.filter(Boolean).map((alt) => {
                          const primaryItem = eligibleItems.find((ei) => ei.id === qi.catalogItemId);
                          const surcharge = primaryItem ? alt!.price - primaryItem.price : 0;
                          return (
                            <span
                              key={alt!.id}
                              className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs"
                            >
                              {alt!.name}
                              {surcharge > 0 ? (
                                <span className="text-amber-600 font-medium">
                                  +{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(surcharge)}
                                </span>
                              ) : surcharge < 0 ? (
                                <span className="text-emerald-600 font-medium">
                                  {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(surcharge)}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                                onClick={() => removeAlternative(index, alt!.id)}
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Add alternative */}
                    {availableForAlt.length > 0 && (
                      <div className="pl-1">
                        <Select
                          value=""
                          onValueChange={(v) => {
                            if (v) addAlternative(index, v);
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs text-muted-foreground w-auto">
                            <SelectValue placeholder="+ Add alternative" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableForAlt.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name} — {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(item.price)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {individualTotal > 0 && (
              <p className="text-xs text-muted-foreground">
                Individual total: {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(individualTotal)}
                {savings > 0 && (
                  <span className="ml-2 text-emerald-600 font-medium">
                    Save {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(savings)}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Apply To */}
          <div className="space-y-3">
            <Label>Apply To</Label>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="applyToCombos" className="text-sm font-normal">Combos</Label>
                <Switch
                  id="applyToCombos"
                  checked={values.applyToCombos}
                  onCheckedChange={handleApplyToCombosChange}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="applyToPartyPacks" className="text-sm font-normal">Party Packs</Label>
                <Switch
                  id="applyToPartyPacks"
                  checked={values.applyToPartyPacks}
                  onCheckedChange={handleApplyToPartyPacksChange}
                />
              </div>
            </div>
          </div>

          {/* Target Parents */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Target Parents</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Leave empty to apply to all eligible combos and party packs.
                </p>
              </div>
              {selectedParentIds.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={clearParents}
                >
                  Clear
                </Button>
              )}
            </div>
            {parentItems.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No combos or party packs available for the selected business unit and apply-to settings.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedParentIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedParentIds.map((id) => {
                      const item = parentItems.find((pi) => pi.id === id);
                      if (!item) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-0.5 text-xs"
                        >
                          {item.name}
                          <button
                            type="button"
                            className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                            onClick={() => toggleParent(id)}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between text-sm font-normal h-9"
                    >
                      <span className="text-muted-foreground">
                        {selectedParentIds.length === 0
                          ? "Select combos or party packs..."
                          : `${selectedParentIds.length} selected`}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder="Search by name..." />
                      <CommandEmpty>No results found.</CommandEmpty>
                      <CommandGroup className="max-h-48 overflow-y-auto">
                        {parentItems.map((item) => {
                          const isSelected = selectedParentIds.includes(item.id);
                          return (
                            <CommandItem
                              key={item.id}
                              onSelect={() => toggleParent(item.id)}
                              className="cursor-pointer"
                            >
                              <div
                                className={cn(
                                  "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "opacity-50",
                                )}
                              >
                                {isSelected && <Check className="h-3 w-3" />}
                              </div>
                              <span>{item.name}</span>
                              <span className="ml-auto text-xs text-muted-foreground capitalize">
                                {item.itemType === "partyPack" ? "Party Pack" : item.itemType}
                              </span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {/* Cart Smart Detection */}
          <div className="space-y-3">
            <Label>Cart Smart Detection</Label>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Offer when qualifying products are independently added to cart
              </p>
              <Switch
                checked={values.cartSmartDetection}
                onCheckedChange={(v) => update("cartSmartDetection", v)}
              />
            </div>
          </div>

          {/* Display Order */}
          <div className="space-y-2">
            <Label htmlFor="displayOrder">Display Order</Label>
            <Input
              id="displayOrder"
              type="number"
              min="0"
              value={values.displayOrder}
              onChange={(e) => update("displayOrder", Number(e.target.value))}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!values.businessUnitId || !values.name.trim() || values.dealPrice <= 0}>
              {isEditing ? "Save Changes" : "Create Meal Deal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
