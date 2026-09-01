import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_THEME_COLOR } from "@/constants";

import type { BusinessUnit, BusinessUnitFormValues, BusinessUnitStatus } from "./types";

const emptyValues: BusinessUnitFormValues = { name: "", slug: "", status: "active", homepageVisible: true, themeColor: DEFAULT_THEME_COLOR, displayOrder: 1, logoUrl: "", enableCombos: false, enablePartyPacks: false };

interface BusinessUnitFormDialogProps {
  open: boolean;
  businessUnit?: BusinessUnit;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: BusinessUnitFormValues) => void;
}

const toFormValues = (businessUnit?: BusinessUnit): BusinessUnitFormValues => businessUnit ? { ...businessUnit, logoUrl: businessUnit.logoUrl ?? "" } : emptyValues;
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function BusinessUnitFormDialog({ open, businessUnit, onOpenChange, onSubmit }: BusinessUnitFormDialogProps) {
  const dialogKey = `${businessUnit?.id ?? "new"}-${open ? "open" : "closed"}`;
  const isEditing = Boolean(businessUnit);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{isEditing ? "Edit business unit" : "Create business unit"}</DialogTitle><DialogDescription>{isEditing ? "Update the details used across the storefront and admin." : "Set up a business unit for your commerce platform."}</DialogDescription></DialogHeader>
      <BusinessUnitForm key={dialogKey} businessUnit={businessUnit} onSubmit={onSubmit} onCancel={() => onOpenChange(false)} isEditing={isEditing} />
    </DialogContent>
  </Dialog>;
}

interface BusinessUnitFormProps {
  businessUnit?: BusinessUnit;
  isEditing: boolean;
  onSubmit: (values: BusinessUnitFormValues) => void;
  onCancel: () => void;
}

function BusinessUnitForm({ businessUnit, isEditing, onSubmit, onCancel }: BusinessUnitFormProps) {
  const [values, setValues] = useState<BusinessUnitFormValues>(() => toFormValues(businessUnit));
  const [slugEdited, setSlugEdited] = useState(Boolean(businessUnit));
  const formId = useId();
  const update = <K extends keyof BusinessUnitFormValues>(key: K, value: BusinessUnitFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const handleNameChange = (name: string) => { update("name", name); if (!slugEdited) update("slug", slugify(name)); };
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); onSubmit({ ...values, name: values.name.trim(), slug: slugify(values.slug), logoUrl: values.logoUrl.trim() }); };

  return <>
      <form id={formId} className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2"><Label htmlFor={`${formId}-name`}>Name</Label><Input id={`${formId}-name`} value={values.name} onChange={(event) => handleNameChange(event.target.value)} placeholder="e.g. MB Kitchen" required autoFocus /></div>
        <div className="grid gap-2"><Label htmlFor={`${formId}-slug`}>Slug</Label><Input id={`${formId}-slug`} value={values.slug} onChange={(event) => { setSlugEdited(true); update("slug", event.target.value); }} placeholder="e.g. mb-kitchen" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Use lowercase letters, numbers, and hyphens." /><p className="text-xs text-muted-foreground">Used in the business unit URL.</p></div>
        <div className="grid gap-2"><Label htmlFor={`${formId}-logo`}>Logo URL <span className="font-normal text-muted-foreground">(optional)</span></Label><div className="flex items-center gap-3"><Input id={`${formId}-logo`} value={values.logoUrl} onChange={(event) => update("logoUrl", event.target.value)} placeholder="https://..." /><div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border" style={{ backgroundColor: values.logoUrl ? undefined : values.themeColor }}>{values.logoUrl ? <img src={values.logoUrl} alt="Logo preview" className="size-full object-cover" /> : <span className="text-xs font-bold text-white">{values.name.slice(0, 2).toUpperCase() || "MB"}</span>}</div></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor={`${formId}-status`}>Status</Label><Select value={values.status} onValueChange={(value) => update("status", value as BusinessUnitStatus)}><SelectTrigger id={`${formId}-status`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label htmlFor={`${formId}-order`}>Display order</Label><Input id={`${formId}-order`} type="number" min="1" value={values.displayOrder} onChange={(event) => update("displayOrder", Math.max(1, Number(event.target.value)))} required /></div></div>
        <div className="grid gap-2"><Label htmlFor={`${formId}-color`}>Theme color</Label><div className="flex gap-2"><Input id={`${formId}-color`} value={values.themeColor} onChange={(event) => update("themeColor", event.target.value)} pattern="#[0-9a-fA-F]{6}" title="Use a six digit hex color, e.g. #E85D04." required /><Input type="color" value={values.themeColor} onChange={(event) => update("themeColor", event.target.value)} aria-label="Choose theme color" className="w-12 p-1" /></div></div>
        <div className="grid gap-2"><Label htmlFor={`${formId}-combos`}>Enable Combos</Label><Switch id={`${formId}-combos`} checked={values.enableCombos ?? false} onCheckedChange={(checked) => update("enableCombos", checked)} /></div><div className="grid gap-2"><Label htmlFor={`${formId}-partypacks`}>Enable Party Packs</Label><Switch id={`${formId}-partypacks`} checked={values.enablePartyPacks ?? false} onCheckedChange={(checked) => update("enablePartyPacks", checked)} /></div>
        <div className="flex items-center justify-between rounded-lg border p-3"><div><Label htmlFor={`${formId}-visible`}>Show on homepage</Label><p className="mt-1 text-xs text-muted-foreground">Allow customers to discover this unit from the homepage.</p></div><Switch id={`${formId}-visible`} checked={values.homepageVisible} onCheckedChange={(checked) => update("homepageVisible", checked)} /></div>

        {/* ── Delivery Settings ── */}
        <div className="rounded-lg border border-border/60 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">Delivery Settings</p>
            <p className="text-xs text-muted-foreground">Configure delivery origin and radius for this business unit.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-origin-lat`}>Origin Latitude</Label>
              <Input id={`${formId}-origin-lat`} type="number" step="any" min="-90" max="90" value={values.originLatitude ?? ""} onChange={(event) => update("originLatitude", event.target.value === "" ? undefined : Number(event.target.value))} placeholder="e.g. 17.385" />
              <p className="text-[10px] text-muted-foreground">Kitchen&apos;s physical location.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-origin-lng`}>Origin Longitude</Label>
              <Input id={`${formId}-origin-lng`} type="number" step="any" min="-180" max="180" value={values.originLongitude ?? ""} onChange={(event) => update("originLongitude", event.target.value === "" ? undefined : Number(event.target.value))} placeholder="e.g. 78.4867" />
              <p className="text-[10px] text-muted-foreground">Must be set with latitude.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-radius`}>Delivery Radius (km)</Label>
              <Input id={`${formId}-radius`} type="number" step="0.1" min="0.1" value={values.deliveryRadiusKm ?? ""} onChange={(event) => update("deliveryRadiusKm", event.target.value === "" ? undefined : Number(event.target.value))} placeholder="e.g. 15" />
              <p className="text-[10px] text-muted-foreground">Customers beyond this radius cannot receive delivery.</p>
            </div>
          </div>
        </div>
      </form>
      <DialogFooter><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" form={formId}>{isEditing ? "Save changes" : "Create business unit"}</Button></DialogFooter>
  </>;
}