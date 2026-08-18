import { useId, useState, useMemo, useEffect } from "react";
import { Minus, Plus, GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { PartyPack, PartyPackFormValues, PartyPackStatus } from "./types";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const emptyValues: PartyPackFormValues = {
  businessUnitId: "",
  name: "",
  slug: "",
  description: "",
  imageUrl: "",
  items: [],
  minServings: 10,
  maxServings: 20,
  price: 0,
  compareAtPrice: 0,
  status: "active",
  featured: false,
  displayOrder: 1,
};

const toFormValues = (pack?: PartyPack): PartyPackFormValues =>
  pack
    ? {
        businessUnitId: pack.businessUnitId,
        name: pack.name,
        slug: pack.slug,
        description: pack.description ?? "",
        imageUrl: pack.imageUrl ?? "",
        items: pack.items.map((item) => ({
          catalogItemId: item.catalogItemId,
          quantity: item.quantity,
        })),
        minServings: pack.minServings,
        maxServings: pack.maxServings,
        price: pack.price,
        compareAtPrice: pack.compareAtPrice ?? 0,
        status: pack.status,
        featured: pack.featured,
        displayOrder: pack.displayOrder,
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

interface PartyPackFormDialogProps {
  open: boolean;
  partyPack?: PartyPack;
  businessUnits: { id: string; name: string }[];
  catalogItems: CatalogItem[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PartyPackFormValues) => void;
}

export function PartyPackFormDialog({
  open,
  partyPack,
  businessUnits,
  catalogItems,
  onOpenChange,
  onSubmit,
}: PartyPackFormDialogProps) {
  const dialogKey = `${partyPack?.id ?? "new"}-${open ? "open" : "closed"}`;
  const isEditing = Boolean(partyPack);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit party pack" : "Create party pack"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the party pack details."
              : "Add a new party pack to your catalog."}
          </DialogDescription>
        </DialogHeader>
        <PartyPackForm
          key={dialogKey}
          partyPack={partyPack}
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

interface PartyPackFormProps {
  partyPack?: PartyPack;
  businessUnits: { id: string; name: string }[];
  catalogItems: CatalogItem[];
  isEditing: boolean;
  onSubmit: (values: PartyPackFormValues) => void;
  onCancel: () => void;
}

function PartyPackForm({
  partyPack,
  businessUnits,
  catalogItems,
  isEditing,
  onSubmit,
  onCancel,
}: PartyPackFormProps) {
  const [values, setValues] = useState<PartyPackFormValues>(() =>
    toFormValues(partyPack)
  );
  const [slugEdited, setSlugEdited] = useState(Boolean(partyPack));
  const formId = useId();

  const update = <K extends keyof PartyPackFormValues>(
    key: K,
    value: PartyPackFormValues[K]
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
    // Calculate compareAtPrice from party pack items — only products WITH compareAtPrice contribute
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

    // Calculate savings (compareAtPrice - price), prevent negative
    const savings = finalCompareAtPrice !== undefined ? Math.max(0, finalCompareAtPrice - values.price) : 0;

    // Note: savingsPercentage is NOT stored in Party Pack schema.
    // It is derived at display time from compareAtPrice and price.

    return { totalCompareAtPrice: finalCompareAtPrice, savings };
  }, [values.items, values.price, eligibleItems]);

  // Sync server-authoritative compareAtPrice into the disabled form field
  // so the admin sees live updates when items/quantities/price change.
  useEffect(() => {
    const nextCompareAt = calculatePricing.totalCompareAtPrice ?? 0;
    if (values.compareAtPrice !== nextCompareAt) {
      setValues((current) => ({
        ...current,
        compareAtPrice: nextCompareAt,
      }));
    }
  }, [calculatePricing, values.compareAtPrice]);

  const handleNameChange = (name: string) => {
    update("name", name);
    if (!slugEdited) update("slug", slugify(name));
  };

  const handleBuChange = (buId: string) => {
    update("businessUnitId", buId);
    update("items", []);
  };

  const addItem = () => {
    update("items", [...values.items, { catalogItemId: "", quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    update(
      "items",
      values.items.filter((_, i) => i !== index)
    );
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
            placeholder="e.g. Mega Party Pack"
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
            placeholder="e.g. mega-party-pack"
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            title="Use lowercase letters, numbers, and hyphens."
          />
          <p className="text-xs text-muted-foreground">
            Used in the party pack URL.
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
            placeholder="Describe the party pack…"
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
            <Label>Items</Label>
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
              the party pack.
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

        {/* Servings */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-minServings`}>Min Servings</Label>
            <Input
              id={`${formId}-minServings`}
              type="number"
              min="1"
              value={values.minServings}
              onChange={(event) =>
                update("minServings", Math.max(1, Number(event.target.value)))
              }
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-maxServings`}>Max Servings</Label>
            <Input
              id={`${formId}-maxServings`}
              type="number"
              min="1"
              value={values.maxServings}
              onChange={(event) =>
                update("maxServings", Math.max(1, Number(event.target.value)))
              }
              required
            />
          </div>
        </div>

        {/* Price + Compare at price */}
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        {/* Status + Display Order */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-status`}>Status</Label>
            <Select
              value={values.status}
              onValueChange={(value) =>
                update("status", value as PartyPackStatus)
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

        {/* Featured toggle */}
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
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form={formId}>
          {isEditing ? "Save changes" : "Create party pack"}
        </Button>
      </DialogFooter>
    </>
  );
}
