import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { Category, CategoryFormValues, CategoryStatus } from "./types";

const emptyValues: CategoryFormValues = { businessUnitId: "", name: "", slug: "", imageUrl: "", displayOrder: 1, status: "active" };

interface CategoryFormDialogProps {
  open: boolean;
  category?: Category;
  businessUnits: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CategoryFormValues) => void;
}

const toFormValues = (category?: Category): CategoryFormValues => category ? { businessUnitId: category.businessUnitId, name: category.name, slug: category.slug, imageUrl: category.imageUrl ?? "", displayOrder: category.displayOrder, status: category.status } : emptyValues;
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function CategoryFormDialog({ open, category, businessUnits, onOpenChange, onSubmit }: CategoryFormDialogProps) {
  const dialogKey = `${category?.id ?? "new"}-${open ? "open" : "closed"}`;
  const isEditing = Boolean(category);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{isEditing ? "Edit category" : "Create category"}</DialogTitle><DialogDescription>{isEditing ? "Update the category details." : "Add a new category to organize your products."}</DialogDescription></DialogHeader>
      <CategoryForm key={dialogKey} category={category} businessUnits={businessUnits} onSubmit={onSubmit} onCancel={() => onOpenChange(false)} isEditing={isEditing} />
    </DialogContent>
  </Dialog>;
}

interface CategoryFormProps {
  category?: Category;
  businessUnits: { id: string; name: string }[];
  isEditing: boolean;
  onSubmit: (values: CategoryFormValues) => void;
  onCancel: () => void;
}

function CategoryForm({ category, businessUnits, isEditing, onSubmit, onCancel }: CategoryFormProps) {
  const [values, setValues] = useState<CategoryFormValues>(() => toFormValues(category));
  const [slugEdited, setSlugEdited] = useState(Boolean(category));
  const formId = useId();
  const update = <K extends keyof CategoryFormValues>(key: K, value: CategoryFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const handleNameChange = (name: string) => { update("name", name); if (!slugEdited) update("slug", slugify(name)); };
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); onSubmit({ ...values, name: values.name.trim(), slug: slugify(values.slug), imageUrl: values.imageUrl.trim() }); };

  return <>
    <form id={formId} className="grid gap-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <Label htmlFor={`${formId}-bu`}>Business Unit</Label>
        <Select value={values.businessUnitId} onValueChange={(value) => update("businessUnitId", value)} disabled={isEditing}>
          <SelectTrigger id={`${formId}-bu`}><SelectValue placeholder="Select a business unit" /></SelectTrigger>
          <SelectContent>{businessUnits.map((bu) => <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>)}</SelectContent>
        </Select>
        {isEditing && <p className="text-xs text-muted-foreground">Business unit cannot be changed after creation.</p>}
      </div>
      <div className="grid gap-2"><Label htmlFor={`${formId}-name`}>Name</Label><Input id={`${formId}-name`} value={values.name} onChange={(event) => handleNameChange(event.target.value)} placeholder="e.g. Beverages" required autoFocus /></div>
      <div className="grid gap-2"><Label htmlFor={`${formId}-slug`}>Slug</Label><Input id={`${formId}-slug`} value={values.slug} onChange={(event) => { setSlugEdited(true); update("slug", event.target.value); }} placeholder="e.g. beverages" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Use lowercase letters, numbers, and hyphens." /><p className="text-xs text-muted-foreground">Used in the category URL.</p></div>
      <div className="grid gap-2"><Label htmlFor={`${formId}-image`}>Image URL <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${formId}-image`} value={values.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} placeholder="https://..." /></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor={`${formId}-status`}>Status</Label><Select value={values.status} onValueChange={(value) => update("status", value as CategoryStatus)}><SelectTrigger id={`${formId}-status`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label htmlFor={`${formId}-order`}>Display order</Label><Input id={`${formId}-order`} type="number" min="1" value={values.displayOrder} onChange={(event) => update("displayOrder", Math.max(1, Number(event.target.value)))} required /></div></div>
    </form>
    <DialogFooter><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" form={formId}>{isEditing ? "Save changes" : "Create category"}</Button></DialogFooter>
  </>;
}
