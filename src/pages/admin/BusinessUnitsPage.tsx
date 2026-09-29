import { useMemo, useState } from "react";
import { AlertCircle, Building2, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { BusinessUnitDialogs } from "@/components/admin/business-units/BusinessUnitDialogs";
import { BusinessUnitFormDialog } from "@/components/admin/business-units/BusinessUnitFormDialog";
import { BusinessUnitTable } from "@/components/admin/business-units/BusinessUnitTable";
import { BusinessUnitToolbar } from "@/components/admin/business-units/BusinessUnitToolbar";
import type { BusinessUnit, BusinessUnitFilters, BusinessUnitFormValues, BusinessUnitSortKey, SortDirection } from "@/components/admin/business-units/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { EMPTY_MESSAGES } from "@/constants";
import { useAdminAuth } from "@/hooks/use-admin-auth";

const PAGE_SIZE = 8;

// ---------------------------------------------------------------------------
// Mapping helpers — keep Convex document shapes out of the UI layer
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromConvex(doc: any): BusinessUnit {
  return {
    id: doc._id,
    name: doc.name,
    slug: doc.slug,
    status: doc.status,
    homepageVisible: doc.homepageVisible,
    themeColor: doc.themeColor,
    displayOrder: doc.displayOrder,
    logoUrl: doc.logo ?? undefined,
    enableCombos: doc.enableCombos,
    enablePartyPacks: doc.enablePartyPacks,
    enableDelivery: doc.enableDelivery,
    serviceabilityMode: doc.serviceabilityMode ?? undefined,
    originLatitude: doc.originLatitude,
    originLongitude: doc.originLongitude,
    deliveryRadiusKm: doc.deliveryRadiusKm,
  };
}

function toCreateArgs(values: BusinessUnitFormValues) {
  return {
    name: values.name,
    slug: values.slug,
    logo: values.logoUrl || undefined,
    themeColor: values.themeColor,
    displayOrder: values.displayOrder,
    homepageVisible: values.homepageVisible,
    status: values.status,
    enableCombos: values.enableCombos ?? false,
    enablePartyPacks: values.enablePartyPacks ?? false,
    enableOffers: false,
    enableSearch: false,
    enableCheckout: false,
    enableDelivery: values.enableDelivery ?? false,
    enablePickup: false,
    serviceabilityMode: values.serviceabilityMode ?? "coordinate_radius",
  };
}

function toUpdateArgs(id: string, values: BusinessUnitFormValues) {
  return {
    id: id as any,
    name: values.name,
    slug: values.slug,
    logo: values.logoUrl || undefined,
    themeColor: values.themeColor,
    displayOrder: values.displayOrder,
    homepageVisible: values.homepageVisible,
    status: values.status,
    enableCombos: values.enableCombos ?? false,
    enablePartyPacks: values.enablePartyPacks ?? false,
    enableDelivery: values.enableDelivery ?? false,
    serviceabilityMode: values.serviceabilityMode,
    originLatitude: values.originLatitude,
    originLongitude: values.originLongitude,
    deliveryRadiusKm: values.deliveryRadiusKm,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BusinessUnitsPage() {
  const { getSessionToken } = useAdminAuth();
  const allDocs = useQuery(api.businessUnits.getAll);
  const createBU = useMutation(api.businessUnits.create);
  const updateBU = useMutation(api.businessUnits.update);
  const softDeleteBU = useMutation(api.businessUnits.softDelete);
  const restoreBU = useMutation(api.businessUnits.restore);

  const isLoading = allDocs === undefined;
  // 19C: `error` is the list-level load error (query failures). Mutation
  // failures use `actionError` so the list stays mounted.
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ title: string; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [filters, setFilters] = useState<BusinessUnitFilters>({ query: "", status: "all" });
  const [sortKey, setSortKey] = useState<BusinessUnitSortKey>("displayOrder");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingBusinessUnit, setEditingBusinessUnit] = useState<BusinessUnit>();
  const [deleteTarget, setDeleteTarget] = useState<BusinessUnit>();
  const [restoreTarget, setRestoreTarget] = useState<BusinessUnit>();

  const businessUnits = useMemo(() => (allDocs ?? []).map(fromConvex), [allDocs]);

  const filteredBusinessUnits = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return businessUnits.filter((unit) => (filters.status === "all" || unit.status === filters.status) && (!query || unit.name.toLowerCase().includes(query) || unit.slug.toLowerCase().includes(query)));
  }, [businessUnits, filters]);

  const sortedBusinessUnits = useMemo(() => [...filteredBusinessUnits].sort((left, right) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];
    const comparison = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
    return sortDirection === "asc" ? comparison : -comparison;
  }), [filteredBusinessUnits, sortDirection, sortKey]);
  const pageCount = Math.max(1, Math.ceil(sortedBusinessUnits.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleBusinessUnits = sortedBusinessUnits.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetPageAndSetFilters = (nextFilters: BusinessUnitFilters) => { setFilters(nextFilters); setPage(1); };
  const handleSort = (nextKey: BusinessUnitSortKey) => { if (nextKey === sortKey) setSortDirection((direction) => direction === "asc" ? "desc" : "asc"); else { setSortKey(nextKey); setSortDirection("asc"); } };
  const openCreateDialog = () => { setEditingBusinessUnit(undefined); setFormOpen(true); };

  const saveBusinessUnit = async (values: BusinessUnitFormValues) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (editingBusinessUnit) {
        await updateBU({ ...toUpdateArgs(editingBusinessUnit.id, values), sessionToken: getSessionToken()! });
      } else {
        await createBU({ ...toCreateArgs(values), sessionToken: getSessionToken()! });
      }
      setFormOpen(false);
    } catch (err) {
      setActionError({ title: "Could not save business unit", message: err instanceof Error ? err.message : "Failed to save business unit" });
    } finally {
      setIsSaving(false);
    }
  };

  const archiveBusinessUnit = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteBU({ id: deleteTarget.id as any, sessionToken: getSessionToken()! });
      setDeleteTarget(undefined);
    } catch (err) {
      setActionError({ title: "Could not delete business unit", message: err instanceof Error ? err.message : "Failed to archive business unit" });
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreBU({ id: restoreTarget.id as any, sessionToken: getSessionToken()! });
      setRestoreTarget(undefined);
    } catch (err) {
      setActionError({ title: "Could not restore business unit", message: err instanceof Error ? err.message : "Failed to restore business unit" });
    }
  };

  return <div>
    <PageHeader title="Business Units" description="Manage business unit availability, storefront visibility, and presentation.">
      <Button size="sm" onClick={openCreateDialog}><Plus className="mr-1.5 size-4" />Add business unit</Button>
    </PageHeader>

    {actionError ? <Alert variant="destructive" className="mb-4"><AlertCircle className="size-4" /><AlertTitle>{actionError.title}</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{actionError.message}<Button size="sm" variant="outline" onClick={() => setActionError(null)}><RefreshCw className="size-3.5" />Dismiss</Button></AlertDescription></Alert> : null}
    {error ? <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Could not load business units</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{error}<Button size="sm" variant="outline" onClick={() => setError(null)}><RefreshCw className="size-4" />Try again</Button></AlertDescription></Alert> : <section className="overflow-hidden rounded-xl border" aria-label="Business unit management">
      <BusinessUnitToolbar query={filters.query} status={filters.status} onQueryChange={(query) => resetPageAndSetFilters({ ...filters, query })} onStatusChange={(status) => resetPageAndSetFilters({ ...filters, status })} onClear={() => resetPageAndSetFilters({ query: "", status: "all" })} />
      {isLoading ? <BusinessUnitTable businessUnits={[]} isLoading sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onEdit={() => undefined} onDelete={() => undefined} onRestore={() => undefined} /> : visibleBusinessUnits.length === 0 ? <EmptyState icon={Building2} title="No business units found" description={filteredBusinessUnits.length === 0 && businessUnits.length > 0 ? "Try adjusting your search or filters." : EMPTY_MESSAGES.BUSINESS_UNITS} action={businessUnits.length === 0 ? { label: "Create business unit", onClick: openCreateDialog } : undefined} /> : <>
        <BusinessUnitTable businessUnits={visibleBusinessUnits} sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onEdit={(unit) => { setEditingBusinessUnit(unit); setFormOpen(true); }} onDelete={setDeleteTarget} onRestore={setRestoreTarget} />
        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedBusinessUnits.length)} of {sortedBusinessUnits.length}</p><Pagination className="mx-0 w-auto"><PaginationContent><PaginationItem><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((current) => current - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2" aria-live="polite">Page {currentPage} of {pageCount}</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage((current) => current + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination></div>
      </>}
    </section>}
    <BusinessUnitFormDialog open={formOpen} businessUnit={editingBusinessUnit} onOpenChange={setFormOpen} onSubmit={saveBusinessUnit} isSaving={isSaving} />
    <BusinessUnitDialogs deleteTarget={deleteTarget} restoreTarget={restoreTarget} onDeleteOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }} onRestoreOpenChange={(open) => { if (!open) setRestoreTarget(undefined); }} onConfirmDelete={archiveBusinessUnit} onConfirmRestore={confirmRestore} />
  </div>;
}
