import { useMemo, useState } from "react";
import { AlertCircle, FolderTree, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { CategoryDialogs } from "@/components/admin/categories/CategoryDialogs";
import { CategoryFormDialog } from "@/components/admin/categories/CategoryFormDialog";
import { CategoryTable } from "@/components/admin/categories/CategoryTable";
import { CategoryToolbar } from "@/components/admin/categories/CategoryToolbar";
import type { Category, CategoryFilters, CategoryFormValues, CategorySortKey, SortDirection } from "@/components/admin/categories/types";
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
function fromConvex(doc: any, buMap: Map<string, string>): Category {
  return {
    id: doc._id,
    businessUnitId: doc.businessUnitId,
    businessUnitName: buMap.get(doc.businessUnitId) ?? "Unknown",
    name: doc.name,
    slug: doc.slug,
    imageUrl: doc.coverImage ?? doc.images?.[0] ?? undefined,
    displayOrder: doc.displayOrder,
    status: doc.status,
  };
}

function toCreateArgs(values: CategoryFormValues) {
  return {
    businessUnitId: values.businessUnitId as any,
    name: values.name,
    slug: values.slug,
    images: values.imageUrl ? [values.imageUrl] : [],
    coverImage: values.imageUrl || undefined,
    displayOrder: values.displayOrder,
    status: values.status,
  };
}

function toUpdateArgs(id: string, values: CategoryFormValues) {
  return {
    id: id as any,
    name: values.name,
    slug: values.slug,
    images: values.imageUrl ? [values.imageUrl] : [],
    coverImage: values.imageUrl || undefined,
    displayOrder: values.displayOrder,
    status: values.status,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CategoriesPage() {
  const { getSessionToken } = useAdminAuth();
  const allDocs = useQuery(api.categories.getAll);
  const allBUs = useQuery(api.businessUnits.getAll);
  const createCat = useMutation(api.categories.create);
  const updateCat = useMutation(api.categories.update);
  const softDeleteCat = useMutation(api.categories.softDelete);
  const restoreCat = useMutation(api.categories.restore);

  const isLoading = allDocs === undefined || allBUs === undefined;
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<CategoryFilters>({ query: "", status: "all", businessUnitId: "all" });
  const [sortKey, setSortKey] = useState<CategorySortKey>("displayOrder");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category>();
  const [deleteTarget, setDeleteTarget] = useState<Category>();
  const [restoreTarget, setRestoreTarget] = useState<Category>();

  const buMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of allBUs ?? []) map.set(bu._id, bu.name);
    return map;
  }, [allBUs]);

  const businessUnitOptions = useMemo(() => (allBUs ?? []).map((bu) => ({ id: bu._id, name: bu.name })), [allBUs]);

  const categories = useMemo(() => (allDocs ?? []).map((doc) => fromConvex(doc, buMap)), [allDocs, buMap]);

  const filteredCategories = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return categories.filter((cat) =>
      (filters.status === "all" || cat.status === filters.status)
      && (filters.businessUnitId === "all" || cat.businessUnitId === filters.businessUnitId)
      && (!query || cat.name.toLowerCase().includes(query) || cat.slug.toLowerCase().includes(query))
    );
  }, [categories, filters]);

  const sortedCategories = useMemo(() => [...filteredCategories].sort((left, right) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];
    const comparison = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
    return sortDirection === "asc" ? comparison : -comparison;
  }), [filteredCategories, sortDirection, sortKey]);
  const pageCount = Math.max(1, Math.ceil(sortedCategories.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleCategories = sortedCategories.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetPageAndSetFilters = (nextFilters: CategoryFilters) => { setFilters(nextFilters); setPage(1); };
  const handleSort = (nextKey: CategorySortKey) => { if (nextKey === sortKey) setSortDirection((direction) => direction === "asc" ? "desc" : "asc"); else { setSortKey(nextKey); setSortDirection("asc"); } };
  const openCreateDialog = () => { setEditingCategory(undefined); setFormOpen(true); };

  const saveCategory = async (values: CategoryFormValues) => {
    try {
      const token = getSessionToken();
      if (editingCategory) {
        await updateCat({ ...toUpdateArgs(editingCategory.id, values), sessionToken: token! });
      } else {
        await createCat({ ...toCreateArgs(values), sessionToken: token! });
      }
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category");
    }
  };

  const archiveCategory = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteCat({ id: deleteTarget.id as any, sessionToken: getSessionToken()! });
      setDeleteTarget(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive category");
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreCat({ id: restoreTarget.id as any, sessionToken: getSessionToken()! });
      setRestoreTarget(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore category");
    }
  };

  return <div>
    <PageHeader title="Categories" description="Organize your products into categories within each business unit.">
      <Button size="sm" onClick={openCreateDialog}><Plus className="mr-1.5 size-4" />Add category</Button>
    </PageHeader>

    {error ? <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Could not load categories</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{error}<Button size="sm" variant="outline" onClick={() => setError(null)}><RefreshCw className="size-4" />Try again</Button></AlertDescription></Alert> : <section className="overflow-hidden rounded-xl border" aria-label="Category management">
      <CategoryToolbar filters={filters} businessUnits={businessUnitOptions} onFiltersChange={resetPageAndSetFilters} onClear={() => resetPageAndSetFilters({ query: "", status: "all", businessUnitId: "all" })} />
      {isLoading ? <CategoryTable categories={[]} isLoading sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onEdit={() => undefined} onDelete={() => undefined} onRestore={() => undefined} /> : visibleCategories.length === 0 ? <EmptyState icon={FolderTree} title="No categories found" description={filteredCategories.length === 0 && categories.length > 0 ? "Try adjusting your search or filters." : EMPTY_MESSAGES.CATEGORIES} action={categories.length === 0 ? { label: "Create category", onClick: openCreateDialog } : undefined} /> : <>
        <CategoryTable categories={visibleCategories} sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onEdit={(cat) => { setEditingCategory(cat); setFormOpen(true); }} onDelete={setDeleteTarget} onRestore={setRestoreTarget} />
        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedCategories.length)} of {sortedCategories.length}</p><Pagination className="mx-0 w-auto"><PaginationContent><PaginationItem><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((current) => current - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2" aria-live="polite">Page {currentPage} of {pageCount}</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage((current) => current + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination></div>
      </>}
    </section>}
    <CategoryFormDialog open={formOpen} category={editingCategory} businessUnits={businessUnitOptions} onOpenChange={setFormOpen} onSubmit={saveCategory} />
    <CategoryDialogs deleteTarget={deleteTarget} restoreTarget={restoreTarget} onDeleteOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }} onRestoreOpenChange={(open) => { if (!open) setRestoreTarget(undefined); }} onConfirmDelete={archiveCategory} onConfirmRestore={confirmRestore} />
  </div>;
}
