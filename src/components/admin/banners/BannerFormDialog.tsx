import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { getContentMarketingSettings } from "@/utils";

import { contentTypes, contentTypeLabels, bannerStatuses } from "./types";
import type { Banner, BannerFormValues, BannerStatus, ContentType } from "./types";

const emptyValues: BannerFormValues = {
  businessUnitId: "",
  contentType: "hero",
  title: "",
  subtitle: "",
  body: "",
  imageUrl: "",
  mobileImage: "",
  buttonText: "",
  buttonLink: "",
  displayOrder: 1,
  status: "active",
  startDate: "",
  endDate: "",
  exclusive: false,
  backgroundColor: "",
  textColor: "",
  iconUrl: "",
  richText: false,
  sectionWidth: "contained",
  contentBlockStyle: "card",
};

const toFormValues = (banner?: Banner): BannerFormValues => {
  if (!banner) return emptyValues;
  const settings = getContentMarketingSettings(banner);
  return {
    businessUnitId: banner.businessUnitId ?? "",
    contentType: banner.contentType,
    title: banner.title,
    subtitle: banner.subtitle ?? "",
    body: banner.body ?? "",
    imageUrl: banner.imageUrl ?? "",
    mobileImage: settings.mobileImage ?? "",
    buttonText: banner.buttonText ?? "",
    buttonLink: banner.buttonLink ?? "",
    displayOrder: banner.displayOrder,
    status: banner.status,
    startDate: banner.startDate ? new Date(banner.startDate).toISOString().slice(0, 16) : "",
    endDate: banner.endDate ? new Date(banner.endDate).toISOString().slice(0, 16) : "",
    exclusive: settings.exclusive,
    backgroundColor: settings.backgroundColor ?? "",
    textColor: settings.textColor ?? "",
    iconUrl: settings.icon ?? "",
    richText: settings.richText,
    sectionWidth: settings.sectionWidth ?? "contained",
    contentBlockStyle: settings.contentBlockStyle ?? "card",
  };
};

interface BannerFormDialogProps {
  open: boolean;
  banner?: Banner;
  businessUnits: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: BannerFormValues) => void;
  /** When set, the content type is locked to this value (e.g. Happy Hour). */
  lockContentType?: ContentType;
}

export function BannerFormDialog({ open, banner, businessUnits, onOpenChange, onSubmit, lockContentType }: BannerFormDialogProps) {
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
          lockContentType={lockContentType}
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
  lockContentType?: ContentType;
}

function BannerForm({ banner, businessUnits, isEditing, onSubmit, onCancel, lockContentType }: BannerFormProps) {
  const [values, setValues] = useState<BannerFormValues>(() => toFormValues(banner));
  const formId = useId();
  const update = <K extends keyof BannerFormValues>(key: K, value: BannerFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const isHero = values.contentType === "hero";
  const isPromotion = values.contentType === "promotion";
  const isContentBlock = values.contentType === "homepageCard";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      ...values,
      contentType: lockContentType ?? values.contentType,
      title: values.title.trim(),
      subtitle: values.subtitle.trim(),
      body: values.body.trim(),
      imageUrl: values.imageUrl.trim(),
      mobileImage: values.mobileImage.trim(),
      buttonText: values.buttonText.trim(),
      buttonLink: values.buttonLink.trim(),
      iconUrl: values.iconUrl.trim(),
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
            <Select
              value={lockContentType ?? values.contentType}
              onValueChange={(v) => update("contentType", v as ContentType)}
              disabled={Boolean(lockContentType)}
            >
              <SelectTrigger id={`${formId}-type`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {contentTypes.map((ct) => (
                  <SelectItem key={ct} value={ct}>{contentTypeLabels[ct]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lockContentType && (
              <p className="text-xs text-muted-foreground">Type is fixed to {contentTypeLabels[lockContentType]}.</p>
            )}
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
          <Label htmlFor={`${formId}-body`}>
            {values.richText ? "Rich Text (HTML)" : "Body"}
            <span className="font-normal text-muted-foreground"> (optional)</span>
          </Label>
          <Textarea id={`${formId}-body`} value={values.body} onChange={(e) => update("body", e.target.value)} placeholder={values.richText ? "Supports <strong>HTML</strong> and links…" : "Detailed description or content..."} rows={3} />
          {values.richText && (
            <p className="text-xs text-muted-foreground">
              Rendered as rich HTML on the homepage. Use basic markup only.
            </p>
          )}
        </div>

        {/* Images */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-image`}>Desktop Image URL <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-image`} value={values.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} placeholder="https://..." />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-mobileImage`}>Mobile Image URL <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-mobileImage`} value={values.mobileImage} onChange={(e) => update("mobileImage", e.target.value)} placeholder="https://..." />
          </div>
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

        {/* Hero-specific: exclusive */}
        {isHero && (
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor={`${formId}-exclusive`}>Exclusive hero</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Prevent other scheduled hero banners from overlapping this one.
              </p>
            </div>
            <Switch id={`${formId}-exclusive`} checked={values.exclusive} onCheckedChange={(checked) => update("exclusive", checked)} />
          </div>
        )}

        {/* Promotion-specific: colors + icon */}
        {isPromotion && (
          <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-bg`}>Background Color</Label>
              <div className="flex items-center gap-2">
                <Input id={`${formId}-bg`} type="color" value={values.backgroundColor || "#111827"} onChange={(e) => update("backgroundColor", e.target.value)} className="h-9 w-14 p-1" />
                <Input value={values.backgroundColor} onChange={(e) => update("backgroundColor", e.target.value)} placeholder="#111827" className="flex-1 font-mono text-xs" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-text`}>Text Color</Label>
              <div className="flex items-center gap-2">
                <Input id={`${formId}-text`} type="color" value={values.textColor || "#ffffff"} onChange={(e) => update("textColor", e.target.value)} className="h-9 w-14 p-1" />
                <Input value={values.textColor} onChange={(e) => update("textColor", e.target.value)} placeholder="#ffffff" className="flex-1 font-mono text-xs" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-icon`}>Icon / Image URL</Label>
              <Input id={`${formId}-icon`} value={values.iconUrl} onChange={(e) => update("iconUrl", e.target.value)} placeholder="https://..." />
            </div>
          </div>
        )}

        {/* Content block-specific: rich text + layout */}
        {isContentBlock && (
          <div className="grid gap-4 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor={`${formId}-rich`}>Rich text content</Label>
                <p className="mt-1 text-xs text-muted-foreground">Render the body as formatted HTML.</p>
              </div>
              <Switch id={`${formId}-rich`} checked={values.richText} onCheckedChange={(checked) => update("richText", checked)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`${formId}-width`}>Section Width</Label>
                <Select value={values.sectionWidth} onValueChange={(v) => update("sectionWidth", v as BannerFormValues["sectionWidth"])}>
                  <SelectTrigger id={`${formId}-width`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full width</SelectItem>
                    <SelectItem value="contained">Contained</SelectItem>
                    <SelectItem value="narrow">Narrow</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${formId}-style`}>Block Style</Label>
                <Select value={values.contentBlockStyle} onValueChange={(v) => update("contentBlockStyle", v as BannerFormValues["contentBlockStyle"])}>
                  <SelectTrigger id={`${formId}-style`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="fullBleed">Full bleed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-bg`}>Background Color</Label>
              <div className="flex items-center gap-2">
                <Input id={`${formId}-bg`} type="color" value={values.backgroundColor || "#ffffff"} onChange={(e) => update("backgroundColor", e.target.value)} className="h-9 w-14 p-1" />
                <Input value={values.backgroundColor} onChange={(e) => update("backgroundColor", e.target.value)} placeholder="#ffffff" className="flex-1 font-mono text-xs" />
              </div>
            </div>
          </div>
        )}

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
