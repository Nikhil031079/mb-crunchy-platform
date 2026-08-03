import { useId, useState } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { sectionTypeLabels, sectionTypes, defaultSectionTarget } from "./types";
import type { HomepageSectionFormValues, HomepageSectionRow, SectionTarget } from "./types";

interface HomepageSectionFormDialogProps {
  open: boolean;
  row?: HomepageSectionRow;
  businessUnits: { id: string; name: string }[];
  /** Display orders already in use for a given target (excluding the row being edited). */
  usedOrdersForTarget: (target: SectionTarget, excludeSectionType?: string) => Set<number>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: HomepageSectionFormValues) => void;
}

function toDatetimeLocal(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toFormValues(row?: HomepageSectionRow): HomepageSectionFormValues {
  if (!row) {
    return {
      sectionType: "featuredProducts",
      title: "",
      subtitle: "",
      ctaLabel: "",
      ctaLink: "",
      target: defaultSectionTarget,
      displayOrder: 1,
      visible: true,
      startDate: "",
      endDate: "",
    };
  }
  return {
    sectionType: row.sectionType,
    title: row.title ?? "",
    subtitle: row.subtitle ?? "",
    ctaLabel: row.ctaLabel ?? "",
    ctaLink: row.ctaLink ?? "",
    target: row.target,
    displayOrder: row.displayOrder,
    visible: row.visible,
    startDate: toDatetimeLocal(row.startDate),
    endDate: toDatetimeLocal(row.endDate),
  };
}

export function HomepageSectionFormDialog({
  open,
  row,
  businessUnits,
  usedOrdersForTarget,
  onOpenChange,
  onSubmit,
}: HomepageSectionFormDialogProps) {
  const isEditing = Boolean(row);
  const dialogKey = `${row?.sectionType ?? "new"}-${open ? "open" : "closed"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit homepage section" : "Add homepage section"}</DialogTitle>
          <DialogDescription>
            Control how this section appears on the storefront homepage.
          </DialogDescription>
        </DialogHeader>
        <HomepageSectionForm
          key={dialogKey}
          row={row}
          businessUnits={businessUnits}
          usedOrdersForTarget={usedOrdersForTarget}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface HomepageSectionFormProps {
  row?: HomepageSectionRow;
  businessUnits: { id: string; name: string }[];
  usedOrdersForTarget: (target: SectionTarget, excludeSectionType?: string) => Set<number>;
  onSubmit: (values: HomepageSectionFormValues) => void;
  onCancel: () => void;
}

function HomepageSectionForm({
  row,
  businessUnits,
  usedOrdersForTarget,
  onSubmit,
  onCancel,
}: HomepageSectionFormProps) {
  const [values, setValues] = useState<HomepageSectionFormValues>(() => toFormValues(row));
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  const update = <K extends keyof HomepageSectionFormValues>(key: K, value: HomepageSectionFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const handleTargetChange = (target: string) => {
    update("target", target);
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const start = values.startDate ? new Date(values.startDate).getTime() : undefined;
    const end = values.endDate ? new Date(values.endDate).getTime() : undefined;
    if (start && end && start > end) {
      setError("End date must be after the start date.");
      return;
    }
    const used = usedOrdersForTarget(values.target, values.sectionType);
    if (used.has(values.displayOrder)) {
      setError(`Display order ${values.displayOrder} is already used by another section for this target.`);
      return;
    }
    onSubmit({ ...values, title: values.title.trim() });
  };

  return (
    <>
      <form id={formId} className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-type`}>Section Type</Label>
            <Select value={values.sectionType} onValueChange={(v) => update("sectionType", v as HomepageSectionFormValues["sectionType"])} disabled={Boolean(row)}>
              <SelectTrigger id={`${formId}-type`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {sectionTypes.map((type) => (
                  <SelectItem key={type} value={type}>{sectionTypeLabels[type]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-target`}>Target Stores</Label>
            <Select value={values.target} onValueChange={handleTargetChange}>
              <SelectTrigger id={`${formId}-target`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Both Stores</SelectItem>
                {businessUnits.map((bu) => (
                  <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${formId}-title`}>Section Title <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id={`${formId}-title`} value={values.title} onChange={(e) => update("title", e.target.value)} placeholder="e.g. Customer Favourites" />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${formId}-subtitle`}>Subtitle <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id={`${formId}-subtitle`} value={values.subtitle} onChange={(e) => update("subtitle", e.target.value)} placeholder="Short description shown under the title" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-cta`}>CTA Label <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-cta`} value={values.ctaLabel} onChange={(e) => update("ctaLabel", e.target.value)} placeholder="View All" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-ctaLink`}>CTA Link <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`${formId}-ctaLink`} value={values.ctaLink} onChange={(e) => update("ctaLink", e.target.value)} placeholder="/mb-kitchen" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`${formId}-order`}>Display Priority</Label>
            <Input id={`${formId}-order`} type="number" min="1" value={values.displayOrder} onChange={(e) => update("displayOrder", Math.max(1, Number(e.target.value)))} required />
            <p className="text-xs text-muted-foreground">Lower numbers appear higher on the page.</p>
          </div>
          <div className="grid gap-2">
            <Label>Enabled</Label>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm">Show this section</span>
              <Switch checked={values.visible} onCheckedChange={(checked) => update("visible", checked)} />
            </div>
          </div>
        </div>

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

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-400">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" form={formId}>{row ? "Save changes" : "Add section"}</Button>
      </DialogFooter>
    </>
  );
}
