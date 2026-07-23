import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { Product, ProductFormValues, ProductStatus, ProductUnit, VegNonVeg } from "./types";
import { productUnits, vegNonVegOptions } from "./types";

const emptyValues: ProductFormValues = { businessUnitId: "", categoryId: "", name: "", slug: "", description: "", imageUrl: "", price: 0, compareAtPrice: "", sku: "", stockQuantity: "", unit: "pcs", vegNonVeg: "veg", taxPercentage: "0", available: true, tags: "", status: "active", featured: false, displayOrder: 1 };

interface ProductFormDialogProps {
  open: boolean;
  product?: Product;
  businessUnits: { id: string; name: string }[];
  categories: { id: string; businessUnitId: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProductFormValues) => void;
}

const toFormValues = (product?: Product): ProductFormValues => product ? { businessUnitId: product.businessUnitId, categoryId: product.categoryId, name: product.name, slug: product.slug, description: product.description ?? "", imageUrl: product.imageUrl ?? "", price: product.price, compareAtPrice: product.compareAtPrice?.toString() ?? "", sku: product.sku ?? "", stockQuantity: product.stockQuantity?.toString() ?? "", unit: (product.unit ?? "pcs") as ProductUnit, vegNonVeg: (product.vegNonVeg ?? "veg") as VegNonVeg, taxPercentage: product.taxPercentage?.toString() ?? "0", available: product.available, tags: product.tags.join(", "), status: product.status, featured: product.featured, displayOrder: product.displayOrder } : emptyValues;
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function ProductFormDialog({ open, product, businessUnits, categories, onOpenChange, onSubmit }: ProductFormDialogProps) {
  const dialogKey = `${product?.id ?? "new"}-${open ? "open" : "closed"}`;
  const isEditing = Boolean(product);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{isEditing ? "Edit product" : "Create product"}</DialogTitle><DialogDescription>{isEditing ? "Update the product details." : "Add a new product to your catalog."}</DialogDescription></DialogHeader>
      <ProductForm key={dialogKey} product={product} businessUnits={businessUnits} categories={categories} onSubmit={onSubmit} onCancel={() => onOpenChange(false)} isEditing={isEditing} />
    </DialogContent>
  </Dialog>;
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
  const update = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const handleNameChange = (name: string) => { update("name", name); if (!slugEdited) update("slug", slugify(name)); };
  const handleBuChange = (buId: string) => { update("businessUnitId", buId); update("categoryId", ""); };
  const filteredCategories = categories.filter((cat) => cat.businessUnitId === values.businessUnitId);
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); onSubmit({ ...values, name: values.name.trim(), slug: slugify(values.slug), description: values.description.trim(), imageUrl: values.imageUrl.trim(), sku: values.sku.trim(), tags: values.tags.trim() }); };

  return <>
    <form id={formId} className="grid gap-4" onSubmit={handleSubmit}>
      {/* Row 1: Business Unit + Category */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-bu`}>Business Unit</Label>
          <Select value={values.businessUnitId} onValueChange={handleBuChange} disabled={isEditing}>
            <SelectTrigger id={`${formId}-bu`}><SelectValue placeholder="Select a business unit" /></SelectTrigger>
            <SelectContent>{businessUnits.map((bu) => <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>)}</SelectContent>
          </Select>
          {isEditing && <p className="text-xs text-muted-foreground">Business unit cannot be changed after creation.</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-cat`}>Category</Label>
          <Select value={values.categoryId} onValueChange={(v) => update("categoryId", v)} disabled={isEditing || !values.businessUnitId}>
            <SelectTrigger id={`${formId}-cat`}><SelectValue placeholder={values.businessUnitId ? "Select a category" : "Select a business unit first"} /></SelectTrigger>
            <SelectContent>{filteredCategories.map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Name + Slug */}
      <div className="grid gap-2"><Label htmlFor={`${formId}-name`}>Name</Label><Input id={`${formId}-name`} value={values.name} onChange={(event) => handleNameChange(event.target.value)} placeholder="e.g. Margherita Pizza" required autoFocus /></div>
      <div className="grid gap-2"><Label htmlFor={`${formId}-slug`}>Slug</Label><Input id={`${formId}-slug`} value={values.slug} onChange={(event) => { setSlugEdited(true); update("slug", event.target.value); }} placeholder="e.g. margherita-pizza" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Use lowercase letters, numbers, and hyphens." /><p className="text-xs text-muted-foreground">Used in the product URL.</p></div>

      {/* Description */}
      <div className="grid gap-2"><Label htmlFor={`${formId}-desc`}>Description <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id={`${formId}-desc`} value={values.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe the product…" rows={3} /></div>

      {/* Image URL */}
      <div className="grid gap-2"><Label htmlFor={`${formId}-image`}>Image URL <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${formId}-image`} value={values.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} placeholder="https://..." /></div>

      {/* Row 3: SKU + Stock + Unit */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2"><Label htmlFor={`${formId}-sku`}>SKU <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${formId}-sku`} value={values.sku} onChange={(event) => update("sku", event.target.value)} placeholder="e.g. SKU-001" /></div>
        <div className="grid gap-2"><Label htmlFor={`${formId}-stock`}>Stock Quantity <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${formId}-stock`} type="number" min="0" value={values.stockQuantity} onChange={(event) => update("stockQuantity", event.target.value)} placeholder="0" /></div>
        <div className="grid gap-2"><Label htmlFor={`${formId}-unit`}>Unit</Label><Select value={values.unit} onValueChange={(v) => update("unit", v as ProductUnit)}><SelectTrigger id={`${formId}-unit`}><SelectValue /></SelectTrigger><SelectContent>{productUnits.map((u) => <SelectItem key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</SelectItem>)}</SelectContent></Select></div>
      </div>

      {/* Row 4: Veg/Non-Veg + Tax */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2"><Label htmlFor={`${formId}-veg`}>Veg / Non-Veg</Label><Select value={values.vegNonVeg} onValueChange={(v) => update("vegNonVeg", v as VegNonVeg)}><SelectTrigger id={`${formId}-veg`}><SelectValue /></SelectTrigger><SelectContent>{vegNonVegOptions.map((o) => <SelectItem key={o} value={o}>{o === "veg" ? "Vegetarian" : "Non-Vegetarian"}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid gap-2"><Label htmlFor={`${formId}-tax`}>Tax % <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${formId}-tax`} type="number" min="0" max="100" step="0.5" value={values.taxPercentage} onChange={(event) => update("taxPercentage", event.target.value)} placeholder="0" /></div>
      </div>

      {/* Row 5: Price + Compare at price */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2"><Label htmlFor={`${formId}-price`}>Price</Label><Input id={`${formId}-price`} type="number" min="0" step="0.01" value={values.price} onChange={(event) => update("price", Math.max(0, Number(event.target.value)))} required /></div>
        <div className="grid gap-2"><Label htmlFor={`${formId}-compare`}>Compare at Price <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${formId}-compare`} type="number" min="0" step="0.01" value={values.compareAtPrice} onChange={(event) => update("compareAtPrice", event.target.value)} placeholder="Strikethrough price" /></div>
      </div>

      {/* Row 6: Status + Display Order */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2"><Label htmlFor={`${formId}-status`}>Status</Label><Select value={values.status} onValueChange={(value) => update("status", value as ProductStatus)}><SelectTrigger id={`${formId}-status`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></div>
        <div className="grid gap-2"><Label htmlFor={`${formId}-order`}>Display Order</Label><Input id={`${formId}-order`} type="number" min="1" value={values.displayOrder} onChange={(event) => update("displayOrder", Math.max(1, Number(event.target.value)))} required /></div>
      </div>

      {/* Tags */}
      <div className="grid gap-2"><Label htmlFor={`${formId}-tags`}>Tags <span className="font-normal text-muted-foreground">(comma-separated, optional)</span></Label><Input id={`${formId}-tags`} value={values.tags} onChange={(event) => update("tags", event.target.value)} placeholder="e.g. pizza, italian, cheese" /></div>

      {/* Toggles */}
      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
        <div className="flex items-center justify-between"><div><Label htmlFor={`${formId}-available`}>Available</Label><p className="text-xs text-muted-foreground">Product is available for ordering.</p></div><Switch id={`${formId}-available`} checked={values.available} onCheckedChange={(checked) => update("available", checked)} /></div>
        <div className="flex items-center justify-between"><div><Label htmlFor={`${formId}-featured`}>Featured</Label><p className="text-xs text-muted-foreground">Highlight on the storefront.</p></div><Switch id={`${formId}-featured`} checked={values.featured} onCheckedChange={(checked) => update("featured", checked)} /></div>
        <div />
      </div>
    </form>
    <DialogFooter><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" form={formId}>{isEditing ? "Save changes" : "Create product"}</Button></DialogFooter>
  </>;
}
