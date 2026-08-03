import { useId, useState } from "react";
import { Flame, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { getOfferMarketingSettings } from "@/utils";

import type { DiscountType, Offer, OfferFormValues, OfferStatus } from "./types";

const emptyValues: OfferFormValues = {
  businessUnitId: "",
  title: "",
  description: "",
  code: "",
  discountType: "percentage",
  discountValue: 0,
  minOrderValue: "",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  status: "active",
  displayOrder: 1,
  banner: "",
  featured: false,
  homeVisible: true,
  categoryVisible: true,
  isFlashSale: false,
  flashSalePriority: 0,
  flashSaleFeatured: false,
};

/** Convert timestamp (ms) to datetime-local string (YYYY-MM-DDTHH:mm) */
function toDatetimeLocal(ts: number | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const toFormValues = (offer?: Offer): OfferFormValues => {
  if (!offer) return emptyValues;
  const settings = getOfferMarketingSettings(offer);
  return {
    businessUnitId: offer.businessUnitId,
    title: offer.title,
    description: offer.description ?? "",
    code: offer.code ?? "",
    discountType: offer.discountType,
    discountValue: offer.discountValue,
    minOrderValue: offer.minOrderValue?.toString() ?? "",
    maxDiscount: offer.maxDiscount?.toString() ?? "",
    startsAt: toDatetimeLocal(offer.startsAt),
    endsAt: toDatetimeLocal(offer.endsAt),
    usageLimit: offer.usageLimit?.toString() ?? "",
    status: offer.status,
    displayOrder: offer.displayOrder,
    banner: offer.banner ?? "",
    featured: settings.featured,
    homeVisible: settings.homeVisible,
    categoryVisible: settings.categoryVisible,
    isFlashSale: settings.isFlashSale,
    flashSalePriority: settings.flashSalePriority,
    flashSaleFeatured: settings.flashSaleFeatured,
  };
};

interface OfferFormDialogProps {
  open: boolean;
  offer?: Offer;
  businessUnits: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: OfferFormValues) => void;
}

export function OfferFormDialog({
  open,
  offer,
  businessUnits,
  onOpenChange,
  onSubmit,
}: OfferFormDialogProps) {
  const dialogKey = `${offer?.id ?? "new"}-${open ? "open" : "closed"}`;
  const isEditing = Boolean(offer);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit offer" : "Create offer"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the offer details."
              : "Add a new offer or coupon to your catalog."}
          </DialogDescription>
        </DialogHeader>
        <OfferForm
          key={dialogKey}
          offer={offer}
          businessUnits={businessUnits}
          isEditing={isEditing}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface OfferFormProps {
  offer?: Offer;
  businessUnits: { id: string; name: string }[];
  isEditing: boolean;
  onSubmit: (values: OfferFormValues) => void;
  onCancel: () => void;
}

function OfferForm({
  offer,
  businessUnits,
  isEditing,
  onSubmit,
  onCancel,
}: OfferFormProps) {
  const [values, setValues] = useState<OfferFormValues>(() =>
    toFormValues(offer)
  );
  const formId = useId();

  const update = <K extends keyof OfferFormValues>(
    key: K,
    value: OfferFormValues[K]
  ) => setValues((current) => ({ ...current, [key]: value }));

  const isCoupon = values.code.trim().length > 0;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      ...values,
      title: values.title.trim(),
      description: values.description.trim(),
      code: values.code.trim().toUpperCase() || "",
      banner: values.banner.trim(),
    });
  };

  return (
    <>
      <form id={formId} className="grid gap-4" onSubmit={handleSubmit}>
        {/* Business Unit */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-bu`}>Business Unit</Label>
          <Select
            value={values.businessUnitId}
            onValueChange={(v) => update("businessUnitId", v)}
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

        {/* Title */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-title`}>Title</Label>
          <Input
            id={`${formId}-title`}
            value={values.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="e.g. Summer Sale 20% Off"
            required
            autoFocus
          />
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
            placeholder="Describe the offer…"
            rows={3}
          />
        </div>

        {/* Coupon Code */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-code`}>
            Coupon Code{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Input
            id={`${formId}-code`}
            value={values.code}
            onChange={(event) => update("code", event.target.value.toUpperCase())}
            placeholder="e.g. SUMMER20"
            pattern="[A-Z0-9]*"
            title="Use uppercase letters and numbers only."
          />
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {isCoupon
                ? "This is a coupon — customers must enter this code at checkout."
                : "Leave empty for an automatic promotion that displays as a banner."}
            </span>
          </div>
        </div>

        {/* Discount Type + Value + Max Discount */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-discountType`}>Discount Type</Label>
            <Select
              value={values.discountType}
              onValueChange={(v) => update("discountType", v as DiscountType)}
            >
              <SelectTrigger id={`${formId}-discountType`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage (%)</SelectItem>
                <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-discountValue`}>
              Discount Value
            </Label>
            <Input
              id={`${formId}-discountValue`}
              type="number"
              min="0"
              step="0.01"
              value={values.discountValue}
              onChange={(event) =>
                update("discountValue", Math.max(0, Number(event.target.value)))
              }
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-maxDiscount`}>
              Max Discount Cap{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id={`${formId}-maxDiscount`}
              type="number"
              min="0"
              step="0.01"
              value={values.maxDiscount}
              onChange={(event) => update("maxDiscount", event.target.value)}
              placeholder={values.discountType === "percentage" ? "Cap for % discount" : "N/A for fixed"}
              disabled={values.discountType === "fixed"}
            />
          </div>
        </div>

        {/* Min Order Value + Usage Limit */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-minOrder`}>
              Min Order Value{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id={`${formId}-minOrder`}
              type="number"
              min="0"
              step="0.01"
              value={values.minOrderValue}
              onChange={(event) => update("minOrderValue", event.target.value)}
              placeholder="0"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-usageLimit`}>
              Usage Limit{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id={`${formId}-usageLimit`}
              type="number"
              min="0"
              value={values.usageLimit}
              onChange={(event) => update("usageLimit", event.target.value)}
              placeholder="Unlimited"
            />
          </div>
        </div>

        {/* Start + End Dates */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-startsAt`}>Start Date</Label>
            <Input
              id={`${formId}-startsAt`}
              type="datetime-local"
              value={values.startsAt}
              onChange={(event) => update("startsAt", event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-endsAt`}>End Date</Label>
            <Input
              id={`${formId}-endsAt`}
              type="datetime-local"
              value={values.endsAt}
              onChange={(event) => update("endsAt", event.target.value)}
              required
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
                update("status", value as OfferStatus)
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

        {/* Homepage marketing */}
        <fieldset className="grid gap-4 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Homepage marketing</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor={`${formId}-featured`}>Featured offer</Label>
                <p className="mt-1 text-xs text-muted-foreground">Show on the homepage featured offers row.</p>
              </div>
              <Switch id={`${formId}-featured`} checked={values.featured} onCheckedChange={(checked) => update("featured", checked)} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor={`${formId}-homeVisible`}>Visible on homepage</Label>
                <p className="mt-1 text-xs text-muted-foreground">Hide without deactivating the offer.</p>
              </div>
              <Switch id={`${formId}-homeVisible`} checked={values.homeVisible} onCheckedChange={(checked) => update("homeVisible", checked)} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor={`${formId}-categoryVisible`}>Visible on category</Label>
                <p className="mt-1 text-xs text-muted-foreground">Hide from category pages.</p>
              </div>
              <Switch id={`${formId}-categoryVisible`} checked={values.categoryVisible} onCheckedChange={(checked) => update("categoryVisible", checked)} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor={`${formId}-flashSaleFeatured`}>Flash sale featured</Label>
                <p className="mt-1 text-xs text-muted-foreground">Highlight in the flash sale section.</p>
              </div>
              <Switch id={`${formId}-flashSaleFeatured`} checked={values.flashSaleFeatured} onCheckedChange={(checked) => update("flashSaleFeatured", checked)} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg bg-secondary/50 p-3">
            <div className="flex items-start gap-2">
              <Flame className="mt-0.5 size-4 text-orange-500" />
              <div>
                <Label htmlFor={`${formId}-flashSale`}>Flash sale item</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Include in the Flash Sales section. Set the priority to control ordering (higher shows first).
                </p>
              </div>
            </div>
            <Switch id={`${formId}-flashSale`} checked={values.isFlashSale} onCheckedChange={(checked) => update("isFlashSale", checked)} />
          </div>
          {values.isFlashSale && (
            <div className="grid gap-2">
              <Label htmlFor={`${formId}-flashPriority`}>Flash Sale Priority</Label>
              <Input
                id={`${formId}-flashPriority`}
                type="number"
                min="0"
                value={values.flashSalePriority}
                onChange={(event) => update("flashSalePriority", Math.max(0, Number(event.target.value)))}
              />
            </div>
          )}
        </fieldset>

        {/* Banner Image */}
        <div className="grid gap-2">
          <Label htmlFor={`${formId}-banner`}>
            Banner Image URL{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Input
            id={`${formId}-banner`}
            value={values.banner}
            onChange={(event) => update("banner", event.target.value)}
            placeholder="https://..."
          />
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form={formId}>
          {isEditing ? "Save changes" : "Create offer"}
        </Button>
      </DialogFooter>
    </>
  );
}
