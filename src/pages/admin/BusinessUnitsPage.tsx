import { useMemo, useState } from "react";
import { AlertCircle, Building2, Plus, RefreshCw } from "lucide-react";

import { BusinessUnitDialogs } from "@/components/admin/business-units/BusinessUnitDialogs";
import { BusinessUnitFormDialog } from "@/components/admin/business-units/BusinessUnitFormDialog";
import { mockBusinessUnits } from "@/components/admin/business-units/mock-data";
import { BusinessUnitTable } from "@/components/admin/business-units/BusinessUnitTable";
import { BusinessUnitToolbar } from "@/components/admin/business-units/BusinessUnitToolbar";
import type { BusinessUnit, BusinessUnitFilters, BusinessUnitFormValues, BusinessUnitSortKey, SortDirection } from "@/components/admin/business-units/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { EMPTY_MESSAGES } from "@/constants";

const PAGE_SIZE = 8;

export default function BusinessUnitsPage() {
  // Replace this local state with a Convex query + mutations without changing presentational components.
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>(mockBusinessUnits);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<BusinessUnitFilters>({ query: "", status: "all" });
  const [sortKey, setSortKey] = useState<BusinessUnitSortKey>("displayOrder");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingBusinessUnit, setEditingBusinessUnit] = useState<BusinessUnit>();
  const [deleteTarget, setDeleteTarget] = useState<BusinessUnit>();
  const [restoreTarget, setRestoreTarget] = useState<BusinessUnit>();

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
  const saveBusinessUnit = (values: BusinessUnitFormValues) => {
    if (editingBusinessUnit) setBusinessUnits((current) => current.map((unit) => unit.id === editingBusinessUnit.id ? { ...unit, ...values, logoUrl: values.logoUrl || undefined } : unit));
    else setBusinessUnits((current) => [{ id: `bu-${crypto.randomUUID()}`, ...values, logoUrl: values.logoUrl || undefined }, ...current]);
    setFormOpen(false);
  };
  const archiveBusinessUnit = () => { if (deleteTarget) setBusinessUnits((current) => current.map((unit) => unit.id === deleteTarget.id ? { ...unit, status: "archived", homepageVisible: false } : unit)); setDeleteTarget(undefined); };

  return <div>
    <PageHeader title="Business Units" description="Manage business unit availability, storefront visibility, and presentation.">
      <Button size="sm" onClick={openCreateDialog}><Plus className="mr-1.5 size-4" />Add business unit</Button>
    </PageHeader>

    {error ? <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Could not load business units</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{error}<Button size="sm" variant="outline" onClick={() => setError(null)}><RefreshCw className="size-4" />Try again</Button></AlertDescription></Alert> : <section className="overflow-hidden rounded-xl border" aria-label="Business unit management">
      <BusinessUnitToolbar query={filters.query} status={filters.status} onQueryChange={(query) => resetPageAndSetFilters({ ...filters, query })} onStatusChange={(status) => resetPageAndSetFilters({ ...filters, status })} onClear={() => resetPageAndSetFilters({ query: "", status: "all" })} />
      {isLoading ? <BusinessUnitTable businessUnits={[]} isLoading sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onEdit={() => undefined} onDelete={() => undefined} onRestore={() => undefined} /> : visibleBusinessUnits.length === 0 ? <EmptyState icon={Building2} title="No business units found" description={filteredBusinessUnits.length === 0 && businessUnits.length > 0 ? "Try adjusting your search or filters." : EMPTY_MESSAGES.BUSINESS_UNITS} action={businessUnits.length === 0 ? { label: "Create business unit", onClick: openCreateDialog } : undefined} /> : <>
        <BusinessUnitTable businessUnits={visibleBusinessUnits} sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onEdit={(unit) => { setEditingBusinessUnit(unit); setFormOpen(true); }} onDelete={setDeleteTarget} onRestore={setRestoreTarget} />
        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedBusinessUnits.length)} of {sortedBusinessUnits.length}</p><Pagination className="mx-0 w-auto"><PaginationContent><PaginationItem><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((current) => current - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2" aria-live="polite">Page {currentPage} of {pageCount}</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage((current) => current + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination></div>
      </>}
    </section>}
    <BusinessUnitFormDialog open={formOpen} businessUnit={editingBusinessUnit} onOpenChange={setFormOpen} onSubmit={saveBusinessUnit} />
    <BusinessUnitDialogs deleteTarget={deleteTarget} restoreTarget={restoreTarget} onDeleteOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }} onRestoreOpenChange={(open) => { if (!open) setRestoreTarget(undefined); }} onConfirmDelete={archiveBusinessUnit} />
  </div>;
}
