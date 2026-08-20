import { useId, useState, useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, GripVertical, ImagePlus, ArrowUp, ArrowDown, Image as ImageIcon } from "lucide-react";

import type { Product, ProductFormValues, ProductStatus, ProductUnit, VegNonVeg, AdminVariant } from "./types";
import { productUnits, vegNonVegOptions, emptyVariant } from "./types";

const emptyValues: ProductFormValues = {
  businessUnitId: "", categoryId: "", name: "", slug: "", description: "", images: [],
  price: 0, compareAtPrice: "", variants: [emptyVariant(0)], hasVariants: false,
  sku: "", stockQuantity: "", unit: "pcs", vegNonVeg: "veg", taxPercentage: "0",
  available: true, tags: "", status: "active", featured: false, displayOrder: 1,
};

// Preset variant groups with suggested option values
const VARIANT_GROUP_PRESETS: Record<string, string[]> = {
  Weight: ["250 g", "500 g", "750 g", "1 kg", "2 kg", "5 kg"],
  Volume: ["100 ml", "200 ml", "250 ml", "500 ml", "750 ml", "1 L", "2 L", "5 L"],
  Quantity: ["1 pc", "2 pcs", "4 pcs", "6 pcs", "10 pcs", "12 pcs", "24 pcs"],
  Pack: ["Single", "Pack of 2", "Pack of 4", "Pack of 6", "Family Pack"],
  Size: ["Small", "Medium", "Large", "XL"],
  Flavor: ["Chocolate", "Vanilla", "Mango", "Strawberry", "Orange", "Mixed Fruit"],
  Color: ["Red", "Blue", "Green", "Black", "White", "Pink", "Yellow"],
};

const PRESET_GROUP_NAMES = Object.keys(VARIANT_GROUP_PRESETS);

interface ProductFormDialogProps {
  open: boolean;
  product?: Product;
  businessUnits: { id: string; name: string }[];
  categories: { id: string; businessUnitId: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProductFormValues) => void;
}

const toFormValues = (product?: Product): ProductFormValues => {
  if (!product) return emptyValues;
  const hasVariants = product.variants.length > 1 ||
    (product.variants.length === 1 && product.variants[0].optionName !== "");
  return {
    businessUnitId: product.businessUnitId,
    categoryId: product.categoryId,
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    images: product.images.length > 0 ? product.images : (product.imageUrl ? [product.imageUrl] : []),
    price: product.price,
    compareAtPrice: product.compareAtPrice?.toString() ?? "",
    variants: product.variants.length > 0 ? product.variants : [emptyVariant(0)],
    hasVariants,
    sku: product.sku ?? "",
    stockQuantity: product.stockQuantity?.toString() ?? "",
    unit: (product.unit ?? "pcs") as ProductUnit,
    vegNonVeg: (product.vegNonVeg ?? "veg") as VegNonVeg,
    taxPercentage: product.taxPercentage?.toString() ?? "0",
    available: product.available,
    tags: product.tags.join(", "),
    status: product.status,
    featured: product.featured,
    displayOrder: product.displayOrder,
  };
};

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function ProductFormDialog({ open, product, businessUnits, categories, onOpenChange, onSubmit }: ProductFormDialogProps) {
  const dialogKey = `${product?.id ?? "new"}-${open ? "open" : "closed"}`;
  const isEditing = Boolean(product);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit product" : "Create product"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update the product details." : "Add a new product to your catalog."}</DialogDescription>
        </DialogHeader>
        <ProductForm
          key={dialogKey}
          product={product}
          businessUnits={businessUnits}
          categories={categories}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isEditing={isEditing}
        />
      </DialogContent>
    </Dialog>
  );
}

interface ProductFormProps {
  product?: Product;
  businessUnits: { id: string; name: string }[];
  categories: { id: string; businessUnitId: string; name: string }[];
  isEditing: boolean;
  onSubmit: (values: ProductFormValues) => void;
  onCancel: () => void;
}

function ProductForm({ product, businessUnits, categories, isEditing, onSubmit, onCancel }: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(() => toFormValues(product));
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const formId = useId();
  const update = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const handleNameChange = (name: string) => { update("name", name); if (!slugEdited) update("slug", slugify(name)); };
  const handleBuChange = (buId: string) => { update("businessUnitId", buId); update("categoryId", ""); };
  const filteredCategories = categories.filter((cat) => cat.businessUnitId === values.businessUnitId);

  const updateVariant = (index: number, field: keyof AdminVariant, value: string | number | boolean) => {
    setValues((current) => {
      const variants = [...current.variants];
      variants[index] = { ...variants[index], [field]: value };
      return { ...current, variants };
    });
  };

  const addVariant = () => {
    setValues((current) => {
      const variants = [...current.variants, emptyVariant(current.variants.length)];
      return { ...current, variants };
    });
  };

  const removeVariant = (index: number) => {
    setValues((current) => {
      const variants = current.variants.filter((_, i) => i !== index);
      if (variants.length === 0) variants.push(emptyVariant(0));
      if (!variants.some((v) => v.isDefault)) variants[0].isDefault = true;
      variants.forEach((v, i) => { v.sortOrder = i; });
      return { ...current, variants };
    });
  };

  const setDefaultVariant = (index: number) => {
    setValues((current) => {
      const variants = current.variants.map((v, i) => ({ ...v, isDefault: i === index }));
      return { ...current, variants };
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedVariants = values.variants.map((v) => ({
      ...v,
      optionName: v.optionName.trim(),
      optionValue: v.optionValue.trim(),
    }));
    onSubmit({
      ...values,
      name: values.name.trim(),
      slug: slugify(values.slug),
      description: values.description.trim(),
      images: values.images.map((url) => url.trim()).filter(Boolean),
      sku: values.sku.trim(),
      tags: values.tags.trim(),
      variants: trimmedVariants,
    });
  };

  const variantGroups = useMemo(() => {
    const groups: { name: string; variants: (AdminVariant & { _index: number })[] }[] = [];
    const seen = new Set<string>();
    values.variants.forEach((v, i) => {
      const groupName = v.optionName || "";
      if (!seen.has(groupName)) {
        seen.add(groupName);
        groups.push({ name: groupName, variants: [] });
      }
      const group = groups.find((g) => g.name === groupName)!;
      group.variants.push({ ...v, _index: i });
    });
    return groups;
  }, [values.variants]);

  return (
    <>
      <form id={formId} className="grid gap-4" onSubmit={handleSubmit}>
        <FormSection title="Basic Information" description="Where this product lives and how it's identified.">
          {/* Row 1: Business Unit + Category */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-bu`}>Business Unit</Label>
              <Select value={values.businessUnitId} onValueChange={handleBuChange}>
                <SelectTrigger id={`${formId}-bu`}><SelectValue placeholder="Select a business unit" /></SelectTrigger>
                <SelectContent>{businessUnits.map((bu) => <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>)}</SelectContent>
              </Select>
              {isEditing && <p className="text-xs text-muted-foreground">Changing Business Unit may affect related combos, party packs, and offers.</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-cat`}>Category</Label>
              <Select value={values.categoryId} onValueChange={(v) => update("categoryId", v)} disabled={!values.businessUnitId}>
                <SelectTrigger id={`${formId}-cat`}><SelectValue placeholder={values.businessUnitId ? "Select a category" : "Select a business unit first"} /></SelectTrigger>
                <SelectContent>{filteredCategories.map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Name + Slug */}
          <div className="grid gap-2"><Label htmlFor={`${formId}-name`}>Name</Label><Input id={`${formId}-name`} value={values.name} onChange={(event) => handleNameChange(event.target.value)} placeholder="e.g. Margherita Pizza" required autoFocus /></div>
          <div className="grid gap-2"><Label htmlFor={`${formId}-slug`}>Slug</Label><Input id={`${formId}-slug`} value={values.slug} onChange={(event) => { setSlugEdited(true); update("slug", event.target.value); }} placeholder="e.g. margherita-pizza" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Use lowercase letters, numbers, and hyphens." /><p className="text-xs text-muted-foreground">Used in the product URL.</p></div>
        </FormSection>

        <FormSection title="Description" description="A short, customer-facing summary shown on product cards and the product page.">
          <div className="grid gap-2"><Label htmlFor={`${formId}-desc`}>Description <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id={`${formId}-desc`} value={values.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe the product…" rows={3} /></div>
        </FormSection>

        <FormSection title="Media" description="Add up to 6 images. The first image is the main cover image; the rest are shown in the product gallery.">
          <MediaManager
            images={values.images}
            onChange={(images) => update("images", images)}
          />
        </FormSection>

        <FormSection title="Pricing & Options" description="Set a single price, or enable variants for option groups like weight, size, or flavour.">
          {/* Variants Toggle */}
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor={`${formId}-hasVariants`}>Product has variants</Label>
                <p className="text-xs text-muted-foreground">Enable option groups (Weight, Volume, Flavor, Size, etc.)</p>
              </div>
              <Switch
                id={`${formId}-hasVariants`}
                checked={values.hasVariants}
                onCheckedChange={(checked) => {
                  update("hasVariants", checked);
                  if (!checked) {
                    update("variants", [{ ...emptyVariant(0), optionName: "", optionValue: "Default", price: values.price }]);
                  } else {
                    const first = values.variants[0] ?? emptyVariant(0);
                    update("variants", [{ ...first, optionName: "", optionValue: "", isDefault: true, sortOrder: 0 }]);
                  }
                }}
              />
            </div>
          </div>

          {/* Variants Section */}
          {values.hasVariants ? (
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Variants</Label>
                <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                  <Plus className="mr-1 size-3.5" />Add Option
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Group options by type (e.g. Weight: 250g, 500g, 1kg). All options share the same group.</p>

              {variantGroups.map((group, groupIndex) => {
                const isCustom = group.name === "__custom__";
                return (
                  <div key={group.variants[0]?._index ?? groupIndex} className="rounded-md border bg-secondary/30 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="size-4 text-muted-foreground" />
                      {!isCustom ? (
                        <Select
                          value={group.name}
                          onValueChange={(newName) => {
                            if (newName === "__custom__") {
                              group.variants.forEach((v) => updateVariant(v._index, "optionName", ""));
                            } else {
                              group.variants.forEach((v) => updateVariant(v._index, "optionName", newName));
                              if (VARIANT_GROUP_PRESETS[newName] && group.variants.length <= 1) {
                                const suggestions = VARIANT_GROUP_PRESETS[newName];
                                suggestions.forEach((suggestion, i) => {
                                  if (group.variants[i]) {
                                    updateVariant(group.variants[i]._index, "optionValue", suggestion);
                                  } else if (i > 0) {
                                    setValues((current) => {
                                      const newVariant = { ...emptyVariant(current.variants.length), optionName: newName, optionValue: suggestion };
                                      return { ...current, variants: [...current.variants, newVariant] };
                                    });
                                  }
                                });
                              }
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 max-w-xs text-sm font-medium w-auto">
                            <SelectValue placeholder="Option Group (e.g. Weight, Volume, Flavor)" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRESET_GROUP_NAMES.map((preset) => (
                              <SelectItem key={preset} value={preset}>{preset}</SelectItem>
                            ))}
                            <SelectItem value="__custom__">Custom…</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={group.name === "__custom__" ? "" : group.name}
                          onChange={(e) => {
                            group.variants.forEach((v) => updateVariant(v._index, "optionName", e.target.value));
                          }}
                          placeholder="Option Group (e.g. Weight, Volume, Flavor)"
                          className="h-8 max-w-xs text-sm font-medium"
                        />
                      )}
                      {group.name && !isCustom && <span className="text-xs text-muted-foreground">({group.variants.length} options)</span>}
                    </div>
                    <div className="space-y-2">
                      {group.variants.map((variant) => (
                        <VariantRow
                          key={variant._index}
                          variant={variant}
                          index={variant._index}
                          onUpdate={updateVariant}
                          onRemove={removeVariant}
                          onSetDefault={setDefaultVariant}
                          canRemove={values.variants.length > 1}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Single price mode */
            <div className="grid gap-4 sm:grid-cols-2 rounded-lg border p-4">
              <div className="grid gap-2">
                <Label htmlFor={`${formId}-price`}>Price</Label>
                <Input id={`${formId}-price`} type="number" min="0" step="0.01" value={values.price} onChange={(event) => update("price", Math.max(0, Number(event.target.value)))} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${formId}-compare`}>Compare at Price <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id={`${formId}-compare`} type="number" min="0" step="0.01" value={values.compareAtPrice} onChange={(event) => update("compareAtPrice", event.target.value)} placeholder="Strikethrough price" />
              </div>
            </div>
          )}
        </FormSection>

        <FormSection title="Inventory & Tax" description="Stock levels, unit, and pricing details.">
          {/* Row: SKU + Stock + Unit */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label htmlFor={`${formId}-sku`}>SKU <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${formId}-sku`} value={values.sku} onChange={(event) => update("sku", event.target.value)} placeholder="e.g. SKU-001" /></div>
            <div className="grid gap-2"><Label htmlFor={`${formId}-stock`}>Stock Quantity <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${formId}-stock`} type="number" min="0" value={values.stockQuantity} onChange={(event) => update("stockQuantity", event.target.value)} placeholder="0" /></div>
            <div className="grid gap-2"><Label htmlFor={`${formId}-unit`}>Unit</Label><Select value={values.unit} onValueChange={(v) => update("unit", v as ProductUnit)}><SelectTrigger id={`${formId}-unit`}><SelectValue /></SelectTrigger><SelectContent>{productUnits.map((u) => <SelectItem key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</SelectItem>)}</SelectContent></Select></div>
          </div>

          {/* Row: Veg/Non-Veg + Tax */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor={`${formId}-veg`}>Veg / Non-Veg</Label><Select value={values.vegNonVeg} onValueChange={(v) => update("vegNonVeg", v as VegNonVeg)}><SelectTrigger id={`${formId}-veg`}><SelectValue /></SelectTrigger><SelectContent>{vegNonVegOptions.map((o) => <SelectItem key={o} value={o}>{o === "veg" ? "Vegetarian" : "Non-Vegetarian"}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor={`${formId}-tax`}>Tax % <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${formId}-tax`} type="number" min="0" max="100" step="0.5" value={values.taxPercentage} onChange={(event) => update("taxPercentage", event.target.value)} placeholder="0" /></div>
          </div>
        </FormSection>

        <FormSection title="Organization" description="Status, ordering, and discoverability.">
          {/* Row: Status + Display Order */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label htmlFor={`${formId}-status`}>Status</Label><Select value={values.status} onValueChange={(value) => update("status", value as ProductStatus)}><SelectTrigger id={`${formId}-status`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor={`${formId}-order`}>Display Order</Label><Input id={`${formId}-order`} type="number" min="1" value={values.displayOrder} onChange={(event) => update("displayOrder", Math.max(1, Number(event.target.value)))} required /></div>
          </div>

          {/* Tags */}
          <div className="grid gap-2"><Label htmlFor={`${formId}-tags`}>Tags <span className="font-normal text-muted-foreground">(comma-separated, optional)</span></Label><Input id={`${formId}-tags`} value={values.tags} onChange={(event) => update("tags", event.target.value)} placeholder="e.g. pizza, italian, cheese" /></div>
        </FormSection>

        <FormSection title="Visibility" description="Control how and where this product appears.">
          {/* Toggles */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between"><div><Label htmlFor={`${formId}-available`}>Available</Label><p className="text-xs text-muted-foreground">Product is available for ordering.</p></div><Switch id={`${formId}-available`} checked={values.available} onCheckedChange={(checked) => update("available", checked)} /></div>
            <div className="flex items-center justify-between"><div><Label htmlFor={`${formId}-featured`}>Featured</Label><p className="text-xs text-muted-foreground">Highlight on the storefront.</p></div><Switch id={`${formId}-featured`} checked={values.featured} onCheckedChange={(checked) => update("featured", checked)} /></div>
          </div>
        </FormSection>
      </form>
      <DialogFooter><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" form={formId}>{isEditing ? "Save changes" : "Create product"}</Button></DialogFooter>
    </>
  );
}

// ---------------------------------------------------------------------------
// Form Section
// ---------------------------------------------------------------------------

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <fieldset className="rounded-xl border border-border/60 bg-card p-4">
      <legend className="sr-only">{title}</legend>
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Media Manager (multiple images)
// ---------------------------------------------------------------------------

const MAX_IMAGES = 6;

interface MediaManagerProps {
  images: string[];
  onChange: (images: string[]) => void;
}

function MediaManager({ images, onChange }: MediaManagerProps) {
  const updateImage = (index: number, value: string) => {
    const next = [...images];
    next[index] = value;
    onChange(next);
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          First image is the main cover. Supports up to {MAX_IMAGES} images.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...images, ""])} disabled={images.length >= MAX_IMAGES}>
          <ImagePlus className="mr-1 size-3.5" />Add Image
        </Button>
      </div>

      {images.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-secondary/20 px-4 py-8 text-center">
          <ImageIcon className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">No images yet. Add image URLs to showcase this product.</p>
        </div>
      ) : (
        images.map((url, index) => (
          <div key={index} className="flex items-center gap-2 rounded-md border bg-secondary/30 p-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
              {url.trim() ? (
                <img
                  src={url.trim()}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.opacity = "0.15";
                  }}
                />
              ) : (
                <ImageIcon className="size-4 text-muted-foreground/40" />
              )}
            </div>
            <Input
              value={url}
              onChange={(e) => updateImage(index, e.target.value)}
              placeholder="https://..."
              className="h-9 flex-1 text-sm"
              aria-label={`Image ${index + 1} URL`}
            />
            {index === 0 && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Cover
              </span>
            )}
            <div className="flex shrink-0 items-center gap-0.5">
              <Button type="button" variant="ghost" size="icon" className="size-7" disabled={index === 0} onClick={() => moveImage(index, -1)} aria-label="Move image up">
                <ArrowUp className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-7" disabled={index === images.length - 1} onClick={() => moveImage(index, 1)} aria-label="Move image down">
                <ArrowDown className="size-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => removeImage(index)} aria-label="Remove image">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant Row
// ---------------------------------------------------------------------------

interface VariantRowProps {
  variant: AdminVariant & { _index: number };
  index: number;
  onUpdate: (index: number, field: keyof AdminVariant, value: string | number | boolean) => void;
  onRemove: (index: number) => void;
  onSetDefault: (index: number) => void;
  canRemove: boolean;
}

function VariantRow({ variant, index, onUpdate, onRemove, onSetDefault, canRemove }: VariantRowProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Option Value</Label>
            <Input
              value={variant.optionValue}
              onChange={(e) => onUpdate(index, "optionValue", e.target.value)}
              placeholder="e.g. 250g"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Price</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={variant.price}
              onChange={(e) => onUpdate(index, "price", Math.max(0, Number(e.target.value)))}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Compare At</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={variant.compareAtPrice}
              onChange={(e) => onUpdate(index, "compareAtPrice", e.target.value)}
              placeholder="-"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">SKU</Label>
            <Input
              value={variant.sku}
              onChange={(e) => onUpdate(index, "sku", e.target.value)}
              placeholder="-"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Stock</Label>
            <Input
              type="number"
              min="0"
              value={variant.stock}
              onChange={(e) => onUpdate(index, "stock", e.target.value)}
              placeholder="0"
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
            <span className="text-[10px] text-muted-foreground">Active</span>
            <Switch
              checked={variant.active}
              onCheckedChange={(checked) => onUpdate(index, "active", checked)}
              aria-label={`Toggle active for ${variant.optionValue || `option ${index + 1}`}`}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setMoreOpen((open) => !open)}
          >
            {moreOpen ? "Less" : "More"}
          </Button>
          <Button
            type="button"
            variant={variant.isDefault ? "default" : "ghost"}
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => onSetDefault(index)}
          >
            {variant.isDefault ? "Default" : "Set Default"}
          </Button>
          {canRemove && (
            <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => onRemove(index)}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {moreOpen && (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2 sm:grid-cols-5">
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Barcode</Label>
            <Input
              value={variant.barcode}
              onChange={(e) => onUpdate(index, "barcode", e.target.value)}
              placeholder="-"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Cost Price</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={variant.costPrice}
              onChange={(e) => onUpdate(index, "costPrice", e.target.value)}
              placeholder="-"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Tax %</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={variant.taxPercentage}
              onChange={(e) => onUpdate(index, "taxPercentage", e.target.value)}
              placeholder="-"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Min Order Qty</Label>
            <Input
              type="number"
              min="1"
              value={variant.minOrderQty}
              onChange={(e) => onUpdate(index, "minOrderQty", e.target.value)}
              placeholder="1"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] text-muted-foreground">Image URL</Label>
            <Input
              value={variant.image}
              onChange={(e) => onUpdate(index, "image", e.target.value)}
              placeholder="https://..."
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}
