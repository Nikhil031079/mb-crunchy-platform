import { useId, useState, useMemo, useEffect } from "react";
import { Minus, Plus, GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { Combo, ComboFormValues, ComboStatus } from "./types";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const emptyValues: ComboFormValues = {
  businessUnitId: "",
  name: "",
  slug: "",
  description: "",
  imageUrl: "",
  items: [],
  price: 0,
  compareAtPrice: 0,
  savingsPercentage: 0,
  status: "active",
  featured: false,
  displayOrder: 1,
  highlightBadge: "",
};

const toFormValues = (combo?: Combo): ComboFormValues =>
  combo
    ? {
        businessUnitId: combo.businessUnitId,
        name: combo.name,
        slug: combo.slug,
        description: combo.description ?? "",
        imageUrl: combo.imageUrl ?? "",
        items: combo.items.map((item) => ({
          catalogItemId: item.catalogItemId,
          quantity: item.quantity,
        })),
        price: combo.price,
        compareAtPrice: combo.compareAtPrice ?? 0,
        savingsPercentage: combo.savingsPercentage ?? 0,
        status: combo.status,
        featured: combo.featured,
        displayOrder: combo.displayOrder,
        highlightBadge: typeof combo.settings?.highlightBadge === "string" ? combo.settings.highlightBadge : "",
      }
    : emptyValues;

interface CatalogItem {
  id: string;
  name: string;
  businessUnitId: string;
  price: number;
  compareAtPrice?: number;
  itemType: string;
}

interface ComboFormDialogProps {
  open: boolean;
  combo?: Combo;
  businessUnits: { id: string; name: string }[];
  catalogItems: CatalogItem[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ComboFormValues) => void;
}

export function ComboFormDialog({
  open,
  combo,
  businessUnits,
  catalogItems,
  onOpenChange,
  onSubmit,
}: ComboFormDialogProps) {
  const dialogKey = `${combo?.id ?? "new"}-${open ? "open" : "closed"}`;
  const isEditing = Boolean(combo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit combo" : "Create combo"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the combo details."
              : "Add a new combo to your catalog."}
          </DialogDescription>
        </DialogHeader>
        <ComboForm
          key={dialogKey}
          combo={combo}
          businessUnits={businessUnits}
          catalogItems={catalogItems}
          isEditing={isEditing}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface ComboFormProps {
  combo?: Combo;
  businessUnits: { id: string; name: string }[];
  catalogItems: CatalogItem[];
  isEditing: boolean;
  onSubmit: (values: ComboFormValues) => void;
  onCancel: () => void;
}

function ComboForm({
  combo,
  businessUnits,
  catalogItems,
  isEditing,
  onSubmit,
  onCancel,
}: ComboFormProps) {
  const [values, setValues] = useState<ComboFormValues>(() =>
    toFormValues(combo)
  );
  const [slugEdited, setSlugEdited] = useState(Boolean(combo));
  const formId = useId();

  const update = <K extends keyof ComboFormValues>(
    key: K,
    value: ComboFormValues[K]
  ) => setValues((current) => ({ ...current, [key]: value }));

  // Only show products from the selected business unit
  const eligibleItems = useMemo(
    () =>
      catalogItems.filter(
        (ci) =>
          ci.itemType === "product" &&
          (!values.businessUnitId || ci.businessUnitId === values.businessUnitId)
      ),
    [catalogItems, values.businessUnitId]
  );

  const calculatePricing = useMemo(() => {
    // Calculate compareAtPrice from combo items — only products WITH compareAtPrice contribute
    let totalCompareAtPrice = 0;
    for (const item of values.items) {
      if (!item.catalogItemId) continue;
      const catalogItem = eligibleItems.find(
        (ci) => ci.id === item.catalogItemId
      );
      if (!catalogItem) continue;
      // Only use the product's actual compareAtPrice — never fall back to price
      if (catalogItem.compareAtPrice !== undefined && catalogItem.compareAtPrice > 0) {
        totalCompareAtPrice += catalogItem.compareAtPrice * item.quantity;
      }
    }

    // Only show compare-at total if at least one component contributed
    const finalCompareAtPrice = totalCompareAtPrice > 0 ? totalCompareAtPrice : undefined;

    // Calculate savings and savingsPercentage
    const savings = finalCompareAtPrice !== undefined ? Math.max(0, finalCompareAtPrice - values.price) : 0;
    const savingsPercentage =
      finalCompareAtPrice !== undefined && finalCompareAtPrice > values.price
        ? (savings / finalCompareAtPrice) * 100
        : 0;

    return { totalCompareAtPrice: finalCompareAtPrice, savings, savingsPercentage };
  }, [values.items, values.price, eligibleItems]);

  // Sync server-authoritative pricing values into the disabled form fields
  // so the admin sees live updates when items/quantities/price change.
  useEffect(() => {
    const nextCompareAt = calculatePricing.totalCompareAtPrice ?? 0;
    const nextSavings = calculatePricing.savingsPercentage;
    if (values.compareAtPrice !== nextCompareAt || values.savingsPercentage !== nextSavings) {
      setValues((current) => ({
        ...current,
        compareAtPrice: nextCompareAt,
        savingsPercentage: nextSavings,
      }));
    }
  }, [calculatePricing, values.compareAtPrice, values.savingsPercentage]);

  const handleNameChange = (name: string) => {
    update("name", name);
    if (!slugEdited) update("slug", slugify(name));
  };

const handleBuChange = (buId: string) => {
    update("businessUnitId", buId);
    // Clear items when BU changes since catalog items are BU-specific
    update("items", []);
  };

const removeItem = (index: number) => {
    update(
      "items",
      values.items.filter((_, i) => i !== index)
    );
  };

  const addItem = () => {
    update("items", [...values.items, { catalogItemId: "", quantity: 1 }]);
  };

  const updateItem = (
    index: number,
    field: "catalogItemId" | "quantity",
    value: string | number
  ) => {
    const newItems = [...values.items];
    if (field === "quantity") {
      newItems[index] = { ...newItems[index], quantity: Math.max(1, Number(value)) };
    } else {
      newItems[index] = { ...newItems[index], catalogItemId: value as string };
    }
    update("items", newItems);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      ...values,
      name: values.name.trim(),
      slug: slugify(values.slug),
      description: values.description.trim(),
      imageUrl: values.imageUrl.trim(),
    });
  };

  const usedItemIds = new Set(
    values.items.filter((item) => item.catalogItemId).map((item) => item.catalogItemId)
  );

  return (
    <>
      <form id={formId} className="grid gap-4" onSubmit={handleSubmit}>
        {/* Business Unit */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-bu`}>Business Unit</Label>
          <Select
            value={values.businessUnitId}
            onValueChange={handleBuChange}
            disabled={isEditing}
          >
            <SelectTrigger id={`${formId}-bu`}>
              <SelectValue placeholder="Select a business unit" />
            </SelectTrigger>
            <SelectContent>
              {businessUnits.map((bu) => (
                <SelectItem key={bu.id} value={bu.id}>
                  {bu.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isEditing && (
            <p className="text-xs text-muted-foreground">
              Business unit cannot be changed after creation.
            </p>
          )}
        </div>

        {/* Name + Slug */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-name`}>Name</Label>
          <Input
            id={`${formId}-name`}
            value={values.name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="e.g. Family Feast Combo"
            required
            autoFocus
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-slug`}>Slug</Label>
          <Input
            id={`${formId}-slug`}
            value={values.slug}
            onChange={(event) => {
              setSlugEdited(true);
              update("slug", event.target.value);
            }}
            placeholder="e.g. family-feast-combo"
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            title="Use lowercase letters, numbers, and hyphens."
          />
          <p className="text-xs text-muted-foreground">
            Used in the combo URL.
          </p>
        </div>

        {/* Description */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-desc`}>
            Description{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Textarea
            id={`${formId}-desc`}
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder="Describe the combo…"
            rows={3}
          />
        </div>

        {/* Image URL */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-image`}>
            Image URL{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Input
            id={`${formId}-image`}
            value={values.imageUrl}
            onChange={(event) => update("imageUrl", event.target.value)}
            placeholder="https://..."
          />
        </div>

        {/* Combo Items */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Combo Items</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              disabled={!values.businessUnitId}
            >
              <Plus className="mr-1.5 size-3.5" />
              Add Item
            </Button>
          </div>
          {!values.businessUnitId && (
            <p className="text-xs text-muted-foreground">
              Select a business unit first to add items.
            </p>
          )}
          {values.items.length === 0 && values.businessUnitId && (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              No items added yet. Click &quot;Add Item&quot; to start building
              the combo.
            </p>
          )}
          {values.items.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border p-2"
            >
              <GripVertical className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex-1">
                <Select
                  value={item.catalogItemId}
                  onValueChange={(value) =>
                    updateItem(index, "catalogItemId", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an item" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleItems
                      .filter(
                        (ci) =>
                          !usedItemIds.has(ci.id) ||
                          ci.id === item.catalogItemId
                      )
                      .map((ci) => (
                        <SelectItem key={ci.id} value={ci.id}>
                          {ci.name} — ₹{ci.price}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-20">
                <Input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(event) =>
                    updateItem(index, "quantity", event.target.value)
                  }
                  aria-label={`Quantity for item ${index + 1}`}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive"
                onClick={() => removeItem(index)}
                aria-label={`Remove item ${index + 1}`}
              >
                <Minus className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Price + Compare at price + Savings */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-price`}>Price</Label>
            <Input
              id={`${formId}-price`}
              type="number"
              min="0"
              step="0.01"
              value={values.price}
              onChange={(event) =>
                update("price", Math.max(0, Number(event.target.value)))
              }
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-compare`}>
              Compare at Price{" "}
              <span className="font-normal text-muted-foreground">
                (auto-calculated from components)
              </span>
            </Label>
            <Input
              id={`${formId}-compare`}
              type="number"
              min="0"
              step="0.01"
              value={values.compareAtPrice}
              readOnly
              disabled
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-savings`}>
              Savings %{" "}
              <span className="font-normal text-muted-foreground">
                (auto-calculated)
              </span>
            </Label>
            <Input
              id={`${formId}-savings`}
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={values.savingsPercentage}
              readOnly
              disabled
            />
          </div>
        </div>

        {/* Status + Display Order */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-status`}>Status</Label>
            <Select
              value={values.status}
              onValueChange={(value) =>
                update("status", value as ComboStatus)
              }
            >
              <SelectTrigger id={`${formId}-status`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-order`}>Display Order</Label>
            <Input
              id={`${formId}-order`}
              type="number"
              min="1"
              value={values.displayOrder}
              onChange={(event) =>
                update(
                  "displayOrder",
                  Math.max(1, Number(event.target.value))
                )
              }
              required
            />
          </div>
        </div>

        {/* Featured toggle + highlight badge */}
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor={`${formId}-featured`}>Featured</Label>
              <p className="text-xs text-muted-foreground">
                Highlight on the storefront.
              </p>
            </div>
            <Switch
              id={`${formId}-featured`}
              checked={values.featured}
              onCheckedChange={(checked) => update("featured", checked)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-highlight`}>
              Highlight Badge{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`${formId}-highlight`}
              value={values.highlightBadge}
              onChange={(event) => update("highlightBadge", event.target.value)}
              placeholder="e.g. Bestseller"
            />
            <p className="text-xs text-muted-foreground">
              Short label rendered as a badge on the combo card.
            </p>
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form={formId}>
          {isEditing ? "Save changes" : "Create combo"}
        </Button>
      </DialogFooter>
    </>
  );
}
