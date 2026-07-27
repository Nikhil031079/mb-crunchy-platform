import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { contentTypes, contentTypeLabels, bannerStatuses } from "./types";
import type { Banner, BannerFormValues, BannerStatus, ContentType } from "./types";

const emptyValues: BannerFormValues = {
  businessUnitId: "",
  contentType: "hero",
  title: "",
  subtitle: "",
  body: "",
  imageUrl: "",
  buttonText: "",
  buttonLink: "",
  displayOrder: 1,
  status: "active",
  startDate: "",
  endDate: "",
};

const toFormValues = (banner?: Banner): BannerFormValues =>
  banner
    ? {
        businessUnitId: banner.businessUnitId ?? "",
        contentType: banner.contentType,
        title: banner.title,
        subtitle: banner.subtitle ?? "",
        body: banner.body ?? "",
        imageUrl: banner.imageUrl ?? "",
        buttonText: banner.buttonText ?? "",
        buttonLink: banner.buttonLink ?? "",
        displayOrder: banner.displayOrder,
        status: banner.status,
        startDate: banner.startDate ? new Date(banner.startDate).toISOString().slice(0, 16) : "",
        endDate: banner.endDate ? new Date(banner.endDate).toISOString().slice(0, 16) : "",
      }
    : emptyValues;

interface BannerFormDialogProps {
  open: boolean;
  banner?: Banner;
  businessUnits: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: BannerFormValues) => void;
}

export function BannerFormDialog({ open, banner, businessUnits, onOpenChange, onSubmit }: BannerFormDialogProps) {
  const isEditing = Boolean(banner);
  const dialogKey = `${banner?.id ?? "new"}-${open ? "open" : "closed"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit banner" : "Create banner"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update the banner details." : "Add a new banner or content piece."}</DialogDescription>
        </DialogHeader>
        <BannerForm
          key={dialogKey}
          banner={banner}
          businessUnits={businessUnits}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          isEditing={isEditing}
        />
      </DialogContent>
    </Dialog>
  );
}

interface BannerFormProps {
  banner?: Banner;
  businessUnits: { id: string; name: string }[];
  isEditing: boolean;
  onSubmit: (values: BannerFormValues) => void;
  onCancel: () => void;
}

function BannerForm({ banner, businessUnits, isEditing, onSubmit, onCancel }: BannerFormProps) {
  const [values, setValues] = useState<BannerFormValues>(() => toFormValues(banner));
  const formId = useId();
  const update = <K extends keyof BannerFormValues>(key: K, value: BannerFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      ...values,
      title: values.title.trim(),
      subtitle: values.subtitle.trim(),
      body: values.body.trim(),
      imageUrl: values.imageUrl.trim(),
      buttonText: values.buttonText.trim(),
      buttonLink: values.buttonLink.trim(),
    });
  };

  return (
    <>
      <form id={formId} className="grid gap-4" onSubmit={handleSubmit}>
        {/* Store + Type */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-bu`}>Business Unit (optional)</Label>
            <Select value={values.businessUnitId || "__global__"} onValueChange={(v) => update("businessUnitId", v === "__global__" ? "" : v)}>
              <SelectTrigger id={`${formId}-bu`}><SelectValue placeholder="Global (all stores)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">Global (all stores)</SelectItem>
                {businessUnits.map((bu) => (
                  <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-type`}>Content Type</Label>
            <Select value={values.contentType} onValueChange={(v) => update("contentType", v as ContentType)}>
              <SelectTrigger id={`${formId}-type`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {contentTypes.map((ct) => (
                  <SelectItem key={ct} value={ct}>{contentTypeLabels[ct]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Title */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-title`}>Title</Label>
          <Input id={`${formId}-title`} value={values.title} onChange={(e) => update("title", e.target.value)} placeholder="Banner headline" required autoFocus />
        </div>

        {/* Subtitle */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-subtitle`}>Subtitle <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id={`${formId}-subtitle`} value={values.subtitle} onChange={(e) => update("subtitle", e.target.value)} placeholder="Short description" />
        </div>

        {/* Body */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-body`}>Body <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id={`${formId}-body`} value={values.body} onChange={(e) => update("body", e.target.value)} placeholder="Detailed description or content..." rows={3} />
        </div>

        {/* Image URL */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-image`}>Image URL <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id={`${formId}-image`} value={values.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} placeholder="https://..." />
        </div>

        {/* Button Text + Link */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-btnText`}>Button Text <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-btnText`} value={values.buttonText} onChange={(e) => update("buttonText", e.target.value)} placeholder="Shop Now" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-btnLink`}>Button Link <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-btnLink`} value={values.buttonLink} onChange={(e) => update("buttonLink", e.target.value)} placeholder="/category-url" />
          </div>
        </div>

        {/* Display Order + Status */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-order`}>Display Order</Label>
            <Input id={`${formId}-order`} type="number" min="1" value={values.displayOrder} onChange={(e) => update("displayOrder", Math.max(1, Number(e.target.value)))} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-status`}>Status</Label>
            <Select value={values.status} onValueChange={(v) => update("status", v as BannerStatus)}>
              <SelectTrigger id={`${formId}-status`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {bannerStatuses.map((s) => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Start/End Date */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-start`}>Start Date <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-start`} type="datetime-local" value={values.startDate} onChange={(e) => update("startDate", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-end`}>End Date <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-end`} type="datetime-local" value={values.endDate} onChange={(e) => update("endDate", e.target.value)} />
          </div>
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" form={formId}>{isEditing ? "Save changes" : "Create banner"}</Button>
      </DialogFooter>
    </>
  );
}
