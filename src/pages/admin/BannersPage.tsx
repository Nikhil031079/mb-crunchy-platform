import { useMemo, useState } from "react";
import { Image, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { BannerTable } from "@/components/admin/banners/BannerTable";
import { BannerToolbar } from "@/components/admin/banners/BannerToolbar";
import { BannerFormDialog } from "@/components/admin/banners/BannerFormDialog";
import { BannerDialogs } from "@/components/admin/banners/BannerDialogs";
import type { Banner, BannerFormValues, BannerFilters, BannerSortKey, SortDirection } from "@/components/admin/banners/types";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { EMPTY_MESSAGES } from "@/constants";
import { AlertCircle } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";

const PAGE_SIZE = 10;

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromConvex(doc: any, buMap: Map<string, string>): Banner {
  return {
    id: doc._id,
    businessUnitId: doc.businessUnitId,
    businessUnitName: doc.businessUnitId ? buMap.get(doc.businessUnitId) ?? "Unknown" : undefined,
    contentType: doc.contentType,
    title: doc.title,
    subtitle: doc.subtitle,
    body: doc.body,
    imageUrl: doc.coverImage ?? doc.images?.[0] ?? undefined,
    buttonText: doc.buttonText,
    buttonLink: doc.buttonLink,
    displayOrder: doc.displayOrder,
    status: doc.status,
    startDate: doc.startDate,
    endDate: doc.endDate,
  };
}

function toCreateArgs(values: BannerFormValues) {
  return {
    businessUnitId: values.businessUnitId ? (values.businessUnitId as any) : undefined,
    contentType: values.contentType as any,
    title: values.title,
    subtitle: values.subtitle || undefined,
    body: values.body || undefined,
    images: values.imageUrl ? [values.imageUrl] : [],
    coverImage: values.imageUrl || undefined,
    buttonText: values.buttonText || undefined,
    buttonLink: values.buttonLink || undefined,
    displayOrder: values.displayOrder,
    status: values.status as any,
    startDate: values.startDate ? new Date(values.startDate).getTime() : undefined,
    endDate: values.endDate ? new Date(values.endDate).getTime() : undefined,
  };
}

function toUpdateArgs(id: string, values: BannerFormValues) {
  return {
    id: id as any,
    title: values.title,
    subtitle: values.subtitle || undefined,
    body: values.body || undefined,
    images: values.imageUrl ? [values.imageUrl] : undefined,
    coverImage: values.imageUrl || undefined,
    buttonText: values.buttonText || undefined,
    buttonLink: values.buttonLink || undefined,
    displayOrder: values.displayOrder,
    status: values.status as any,
    startDate: values.startDate ? new Date(values.startDate).getTime() : undefined,
    endDate: values.endDate ? new Date(values.endDate).getTime() : undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function BannersPage() {
  const { getSessionToken } = useAdminAuth();
  const allDocs = useQuery(api.content.getAll);
  const allBUs = useQuery(api.businessUnits.getAll);
  const createContent = useMutation(api.content.create);
  const updateContent = useMutation(api.content.update);
  const softDeleteContent = useMutation(api.content.softDelete);

  const isLoading = allDocs === undefined || allBUs === undefined;
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<BannerFilters>({ query: "", status: "all", contentType: "all", businessUnitId: "all" });
  const [sortKey, setSortKey] = useState<BannerSortKey>("displayOrder");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner>();
  const [deleteTarget, setDeleteTarget] = useState<Banner>();
  const [restoreTarget, setRestoreTarget] = useState<Banner>();

  const buMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of allBUs ?? []) map.set(bu._id, bu.name);
    return map;
  }, [allBUs]);

  const businessUnitOptions = useMemo(() => (allBUs ?? []).map((bu) => ({ id: bu._id, name: bu.name })), [allBUs]);

  const banners = useMemo(() => (allDocs ?? []).map((doc) => fromConvex(doc, buMap)), [allDocs, buMap]);

  const filteredBanners = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return banners.filter((b) =>
      (filters.status === "all" || b.status === filters.status)
      && (filters.contentType === "all" || b.contentType === filters.contentType)
      && (filters.businessUnitId === "all" || b.businessUnitId === filters.businessUnitId)
      && (!q || b.title.toLowerCase().includes(q) || (b.subtitle?.toLowerCase().includes(q) ?? false))
    );
  }, [banners, filters]);

  const sortedBanners = useMemo(() => [...filteredBanners].sort((left, right) => {
    const leftValue = left[sortKey] ?? "";
    const rightValue = right[sortKey] ?? "";
    const comparison = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
    return sortDirection === "asc" ? comparison : -comparison;
  }), [filteredBanners, sortDirection, sortKey]);

  const pageCount = Math.max(1, Math.ceil(sortedBanners.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleBanners = sortedBanners.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetPageAndSetFilters = (nextFilters: BannerFilters) => { setFilters(nextFilters); setPage(1); };
  const handleSort = (nextKey: BannerSortKey) => { if (nextKey === sortKey) setSortDirection((d) => d === "asc" ? "desc" : "asc"); else { setSortKey(nextKey); setSortDirection("asc"); } };
  const openCreateDialog = () => { setEditingBanner(undefined); setFormOpen(true); };

  const saveBanner = async (values: BannerFormValues) => {
    try {
      if (editingBanner) {
        await updateContent({ ...toUpdateArgs(editingBanner.id, values), sessionToken: getSessionToken()! });
      } else {
        await createContent({ ...toCreateArgs(values), sessionToken: getSessionToken()! });
      }
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save banner");
    }
  };

  const archiveBanner = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteContent({ id: deleteTarget.id as any, sessionToken: getSessionToken()! });
      setDeleteTarget(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive banner");
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      await updateContent({ id: restoreTarget.id as any, status: "active" as any, sessionToken: getSessionToken()! });
      setRestoreTarget(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore banner");
    }
  };

  return (
    <div>
      <PageHeader title="Banners" description="Manage promotional banners and content across your stores.">
        <Button size="sm" onClick={openCreateDialog}><Plus className="mr-1.5 size-4" />Add banner</Button>
      </PageHeader>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load banners</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {error}
            <Button size="sm" variant="outline" onClick={() => setError(null)}><RefreshCw className="size-4" />Try again</Button>
          </AlertDescription>
        </Alert>
      ) : (
        <section className="overflow-hidden rounded-xl border" aria-label="Banner management">
          <BannerToolbar
            filters={filters}
            businessUnits={businessUnitOptions}
            onFiltersChange={resetPageAndSetFilters}
            onClear={() => resetPageAndSetFilters({ query: "", status: "all", contentType: "all", businessUnitId: "all" })}
          />
          {isLoading ? (
            <BannerTable banners={[]} isLoading sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onEdit={() => undefined} onDelete={() => undefined} onRestore={() => undefined} />
          ) : visibleBanners.length === 0 ? (
            <EmptyState
              icon={Image}
              title="No banners found"
              description={filteredBanners.length === 0 && banners.length > 0 ? "Try adjusting your search or filters." : EMPTY_MESSAGES.BANNERS}
              action={banners.length === 0 ? { label: "Create banner", onClick: openCreateDialog } : undefined}
            />
          ) : (
            <>
              <BannerTable
                banners={visibleBanners}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onEdit={(b) => { setEditingBanner(b); setFormOpen(true); }}
                onDelete={setDeleteTarget}
                onRestore={setRestoreTarget}
              />
              <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedBanners.length)} of {sortedBanners.length}</p>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((c) => c - 1)}>Previous</Button></PaginationItem>
                    <PaginationItem><span className="px-2" aria-live="polite">Page {currentPage} of {pageCount}</span></PaginationItem>
                    <PaginationItem><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage((c) => c + 1)}>Next</Button></PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </section>
      )}

      <BannerFormDialog
        open={formOpen}
        banner={editingBanner}
        businessUnits={businessUnitOptions}
        onOpenChange={setFormOpen}
        onSubmit={saveBanner}
      />
      <BannerDialogs
        deleteTarget={deleteTarget}
        restoreTarget={restoreTarget}
        onDeleteOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        onRestoreOpenChange={(open) => { if (!open) setRestoreTarget(undefined); }}
        onConfirmDelete={archiveBanner}
        onConfirmRestore={confirmRestore}
      />
    </div>
  );
}
