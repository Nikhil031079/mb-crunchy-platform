import { useCallback, useMemo, useState } from "react";
import { AlertCircle, LayoutTemplate, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { useAdminAuth } from "@/hooks/use-admin-auth";
import { getHomepageSectionSettings } from "@/utils";

import { HomepageSectionDialogs } from "@/components/admin/homepage-sections/HomepageSectionDialogs";
import { HomepageSectionFormDialog } from "@/components/admin/homepage-sections/HomepageSectionFormDialog";
import { HomepageSectionPreview } from "@/components/admin/homepage-sections/HomepageSectionPreview";
import { HomepageSectionTable } from "@/components/admin/homepage-sections/HomepageSectionTable";
import { HomepageSectionToolbar } from "@/components/admin/homepage-sections/HomepageSectionToolbar";
import type { HomepageSectionFormValues, HomepageSectionRow, SectionTarget } from "@/components/admin/homepage-sections/types";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";

import type { HomepageSection } from "@/types";

const MAX_BUSINESS_UNITS = 4;

function buildRow(section: HomepageSection, buId: string, target: SectionTarget): HomepageSectionRow {
  const settings = getHomepageSectionSettings(section);
  return {
    sectionType: section.sectionType,
    title: section.title,
    displayOrder: section.displayOrder,
    visible: section.visible,
    target,
    businessUnitIds: [buId],
    id: section._id,
    startDate: settings.startDate,
    endDate: settings.endDate,
    ctaLabel: settings.ctaLabel,
    ctaLink: settings.ctaLink,
    subtitle: settings.subtitle,
  };
}

export default function HomepageSectionsPage() {
  const { getSessionToken } = useAdminAuth();
  const allBUs = useQuery(api.businessUnits.getAll);
  const createSection = useMutation(api.homepageSections.create);
  const updateSection = useMutation(api.homepageSections.update);
  const reorderSections = useMutation(api.homepageSections.reorder);
  const softDeleteSection = useMutation(api.homepageSections.softDelete);

  const activeBUs = useMemo(
    () => (allBUs ?? []).filter((bu) => bu.status === "active").slice(0, MAX_BUSINESS_UNITS),
    [allBUs],
  );

  const bu0 = activeBUs[0]?._id;
  const bu1 = activeBUs[1]?._id;
  const bu2 = activeBUs[2]?._id;
  const bu3 = activeBUs[3]?._id;

  const s0 = useQuery(api.homepageSections.getByBusinessUnit, bu0 ? { businessUnitId: bu0 } : "skip");
  const s1 = useQuery(api.homepageSections.getByBusinessUnit, bu1 ? { businessUnitId: bu1 } : "skip");
  const s2 = useQuery(api.homepageSections.getByBusinessUnit, bu2 ? { businessUnitId: bu2 } : "skip");
  const s3 = useQuery(api.homepageSections.getByBusinessUnit, bu3 ? { businessUnitId: bu3 } : "skip");

  const [scope, setScope] = useState<string>("both");
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<HomepageSectionRow>();
  const [previewRow, setPreviewRow] = useState<HomepageSectionRow>();
  const [deleteTarget, setDeleteTarget] = useState<HomepageSectionRow>();

  const isLoading = allBUs === undefined || [s0, s1, s2, s3].some((result, i) => activeBUs[i] && result === undefined);

  const sectionsByBu = useMemo(() => {
    const map = new Map<string, HomepageSection[]>();
    const pairs: [string | undefined, HomepageSection[] | undefined][] = [
      [bu0, s0], [bu1, s1], [bu2, s2], [bu3, s3],
    ];
    for (const [buId, sections] of pairs) {
      if (buId && sections) map.set(buId, sections);
    }
    return map;
  }, [bu0, bu1, bu2, bu3, s0, s1, s2, s3]);

  const businessUnitOptions = useMemo(
    () => activeBUs.map((bu) => ({ id: bu._id, name: bu.name })),
    [activeBUs],
  );

  const rows = useMemo(() => {
    if (sectionsByBu.size === 0) return [] as HomepageSectionRow[];
    if (scope === "both") {
      const map = new Map<string, HomepageSectionRow>();
      for (const [buId, sections] of sectionsByBu) {
        for (const section of sections) {
          const existing = map.get(section.sectionType);
          if (!existing) {
            map.set(section.sectionType, buildRow(section, buId, "both"));
          } else {
            existing.businessUnitIds.push(buId);
            existing.visible = existing.visible && section.visible;
            existing.title = existing.title ?? section.title;
            existing.displayOrder = Math.min(existing.displayOrder, section.displayOrder);
          }
        }
      }
      const allBuIds = activeBUs.map((bu) => bu._id);
      const result = Array.from(map.values());
      for (const row of result) {
        const coversAll = allBuIds.every((id) => row.businessUnitIds.includes(id));
        row.target = coversAll ? "both" : (row.businessUnitIds[0] ?? "both");
      }
      return result.sort((a, b) => a.displayOrder - b.displayOrder);
    }
    return (sectionsByBu.get(scope) ?? [])
      .map((section) => buildRow(section, scope, scope))
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [sectionsByBu, scope, activeBUs]);

  const usedOrdersForTarget = useCallback(
    (target: SectionTarget, excludeSectionType?: string) => {
      const buIds = target === "both" ? activeBUs.map((bu) => bu._id) : [target];
      const orders = new Set<number>();
      for (const [buId, sections] of sectionsByBu) {
        if (!buIds.includes(buId)) continue;
        for (const section of sections) {
          if (excludeSectionType && section.sectionType === excludeSectionType) continue;
          orders.add(section.displayOrder);
        }
      }
      return orders;
    },
    [sectionsByBu, activeBUs],
  );

  const upsert = useCallback(
    async (buId: Id<"businessUnits">, values: HomepageSectionFormValues, settings: Record<string, unknown>) => {
      const token = getSessionToken()!;
      const existing = sectionsByBu.get(buId)?.find((section) => section.sectionType === values.sectionType);
      const common = {
        title: values.title.trim() || undefined,
        displayOrder: values.displayOrder,
        visible: values.visible,
        settings,
      };
      if (existing) {
        await updateSection({ id: existing._id as Id<"homepageSections">, ...common, sessionToken: token });
      } else {
        await createSection({
          businessUnitId: buId,
          sectionType: values.sectionType,
          ...common,
          sessionToken: token,
        });
      }
    },
    [sectionsByBu, createSection, updateSection, getSessionToken],
  );

  const saveSection = async (values: HomepageSectionFormValues) => {
    try {
      const token = getSessionToken()!;
      const settings: Record<string, unknown> = {
        subtitle: values.subtitle.trim() || undefined,
        ctaLabel: values.ctaLabel.trim() || undefined,
        ctaLink: values.ctaLink.trim() || undefined,
        startDate: values.startDate ? new Date(values.startDate).getTime() : undefined,
        endDate: values.endDate ? new Date(values.endDate).getTime() : undefined,
        priority: values.displayOrder,
        target: values.target,
      };
      const targetBuIds = values.target === "both" ? activeBUs.map((bu) => bu._id) : [values.target as Id<"businessUnits">];

      for (const buId of targetBuIds) {
        await upsert(buId, values, settings);
      }

      // When targeting a single store, remove the section from other stores.
      if (values.target !== "both") {
        for (const [buId, sections] of sectionsByBu) {
          if (targetBuIds.includes(buId as Id<"businessUnits">)) continue;
          const existing = sections.find((section) => section.sectionType === values.sectionType);
          if (existing) {
            await softDeleteSection({ id: existing._id as Id<"homepageSections">, sessionToken: token });
          }
        }
      }

      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save section");
    }
  };

  const toggleVisible = async (row: HomepageSectionRow, visible: boolean) => {
    try {
      const token = getSessionToken()!;
      const buIds = row.target === "both" ? activeBUs.map((bu) => bu._id) : [row.target];
      for (const buId of buIds) {
        const existing = sectionsByBu.get(buId)?.find((section) => section.sectionType === row.sectionType);
        if (existing) {
          await updateSection({ id: existing._id as Id<"homepageSections">, visible, sessionToken: token });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle section");
    }
  };

  const moveSection = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    const orderedTypes = next.map((row) => row.sectionType);
    const buIds = scope === "both" ? activeBUs.map((bu) => bu._id) : [scope];
    try {
      const token = getSessionToken()!;
      for (const buId of buIds) {
        const buSections = sectionsByBu.get(buId) ?? [];
        const ordered = buSections
          .map((section) => section.sectionType)
          .filter((type) => orderedTypes.includes(type))
          .sort((a, b) => orderedTypes.indexOf(a) - orderedTypes.indexOf(b));
        const items = ordered.map((type, orderIndex) => {
          const doc = buSections.find((section) => section.sectionType === type)!;
          return { id: doc._id as Id<"homepageSections">, displayOrder: orderIndex + 1, visible: doc.visible };
        });
        if (items.length > 0) {
          await reorderSections({ items, sessionToken: token });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder sections");
    }
  };

  const archiveSection = async () => {
    if (!deleteTarget) return;
    try {
      const token = getSessionToken()!;
      const buIds = deleteTarget.target === "both" ? activeBUs.map((bu) => bu._id) : [deleteTarget.target];
      for (const buId of buIds) {
        const existing = sectionsByBu.get(buId)?.find((section) => section.sectionType === deleteTarget.sectionType);
        if (existing) {
          await softDeleteSection({ id: existing._id as Id<"homepageSections">, sessionToken: token });
        }
      }
      setDeleteTarget(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete section");
    }
  };

  const openCreateDialog = () => {
    setEditingRow(undefined);
    setFormOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Homepage Sections"
        description="Design the storefront homepage: order sections, set schedules and target stores."
      >
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1.5 size-4" />
          Add section
        </Button>
      </PageHeader>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not save changes</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {error}
            <Button size="sm" variant="outline" onClick={() => setError(null)}>
              <RefreshCw className="size-4" />Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <section className="overflow-hidden rounded-xl border" aria-label="Homepage section management">
          <HomepageSectionToolbar
            scope={scope}
            businessUnits={businessUnitOptions}
            onScopeChange={setScope}
          />
          {isLoading ? (
            <HomepageSectionTable
              rows={[]}
              isLoading
              onMove={() => undefined}
              onToggleVisible={() => undefined}
              onPreview={() => undefined}
              onEdit={() => undefined}
              onDelete={() => undefined}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={LayoutTemplate}
              title="No sections configured"
              description="Add sections to build the storefront homepage layout."
              action={{ label: "Add section", onClick: openCreateDialog }}
            />
          ) : (
            <HomepageSectionTable
              rows={rows}
              onMove={moveSection}
              onToggleVisible={toggleVisible}
              onPreview={setPreviewRow}
              onEdit={(row) => { setEditingRow(row); setFormOpen(true); }}
              onDelete={setDeleteTarget}
            />
          )}
        </section>
      )}

      <HomepageSectionFormDialog
        open={formOpen}
        row={editingRow}
        businessUnits={businessUnitOptions}
        usedOrdersForTarget={usedOrdersForTarget}
        onOpenChange={setFormOpen}
        onSubmit={saveSection}
      />
      <HomepageSectionPreview
        open={Boolean(previewRow)}
        row={previewRow}
        onOpenChange={(open) => { if (!open) setPreviewRow(undefined); }}
      />
      <HomepageSectionDialogs
        deleteTarget={deleteTarget}
        onDeleteOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        onConfirmDelete={archiveSection}
      />
    </div>
  );
}
