import { LayoutGrid, Store, Package, Combine, PartyPopper, BadgePercent, FileText, Image, Quote } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AdminDialog } from "@/components/admin/design-system/AdminDialogs";

import { sectionTypeLabels } from "./types";
import type { HomepageSectionRow } from "./types";

const typeIcons: Record<string, LucideIcon> = {
  hero: Image,
  businessUnits: Store,
  featuredProducts: Package,
  combos: Combine,
  partyPacks: PartyPopper,
  offers: BadgePercent,
  content: FileText,
  testimonials: Quote,
  footer: LayoutGrid,
};

interface HomepageSectionPreviewProps {
  open: boolean;
  row: HomepageSectionRow | undefined;
  onOpenChange: (open: boolean) => void;
}

function formatRange(startDate?: number, endDate?: number) {
  if (!startDate && !endDate) return "Always on";
  const fmt = (ts: number) => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (startDate && endDate) return `${fmt(startDate)} – ${fmt(endDate)}`;
  if (startDate) return `From ${fmt(startDate)}`;
  if (endDate) return `Until ${fmt(endDate)}`;
  return "Always on";
}

export function HomepageSectionPreview({ open, row, onOpenChange }: HomepageSectionPreviewProps) {
  const Icon = row ? typeIcons[row.sectionType] ?? LayoutGrid : LayoutGrid;

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={row ? sectionTypeLabels[row.sectionType] : "Section preview"}
      description="A live preview of how this section appears on the storefront."
      className="sm:max-w-lg"
    >
      {row && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card">
            <div className="flex items-center gap-3 border-b p-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
                <Icon className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold leading-tight">{row.title || sectionTypeLabels[row.sectionType]}</p>
                {row.subtitle && <p className="text-sm text-muted-foreground">{row.subtitle}</p>}
              </div>
            </div>
            <div className="flex h-20 items-center justify-center gap-3 bg-secondary/40 px-4">
              <div className="h-16 w-24 animate-pulse rounded-lg bg-secondary" />
              <div className="h-16 w-24 animate-pulse rounded-lg bg-secondary" />
              <div className="hidden h-16 w-24 animate-pulse rounded-lg bg-secondary sm:block" />
            </div>
            {row.ctaLabel && (
              <div className="flex items-center justify-between border-t p-3">
                <span className="text-sm font-medium text-accent">{row.ctaLabel}</span>
                <span className="text-xs text-muted-foreground">{row.ctaLink || "No link"}</span>
              </div>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Display order</dt>
              <dd className="mt-0.5 font-medium">#{row.displayOrder}</dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Target</dt>
              <dd className="mt-0.5 font-medium">{row.target === "both" ? "Both Stores" : "Selected store"}</dd>
            </div>
            <div className="col-span-2 rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Schedule</dt>
              <dd className="mt-0.5 font-medium">{formatRange(row.startDate, row.endDate)}</dd>
            </div>
            <div className="col-span-2 rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd className="mt-0.5 font-medium">{row.visible ? "Enabled" : "Hidden from homepage"}</dd>
            </div>
          </dl>
        </div>
      )}
    </AdminDialog>
  );
}
