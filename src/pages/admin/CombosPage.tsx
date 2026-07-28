import { useMemo, useState } from "react";
import { AlertCircle, Package, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { ComboDialogs } from "@/components/admin/combos/ComboDialogs";
import { ComboFormDialog } from "@/components/admin/combos/ComboFormDialog";
import { ComboTable } from "@/components/admin/combos/ComboTable";
import { ComboToolbar } from "@/components/admin/combos/ComboToolbar";
import type {
  Combo,
  ComboFilters,
  ComboFormValues,
  ComboSortKey,
  ComboStatus,
  SortDirection,
} from "@/components/admin/combos/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { EMPTY_MESSAGES } from "@/constants";
import { useAdminAuth } from "@/hooks/use-admin-auth";

const PAGE_SIZE = 8;

// ---------------------------------------------------------------------------
// Mapping helpers — keep Convex document shapes out of the UI layer
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromConvex(doc: any, buMap: Map<string, string>): Combo {
  return {
    id: doc._id,
    businessUnitId: doc.businessUnitId,
    businessUnitName: buMap.get(doc.businessUnitId) ?? "Unknown",
    name: doc.name,
    slug: doc.slug,
    description: doc.description,
    imageUrl: doc.coverImage ?? doc.images?.[0] ?? undefined,
    items: (doc.items ?? []).map((item: any) => ({
      catalogItemId: item.catalogItemId,
      quantity: item.quantity,
    })),
    price: doc.price,
    compareAtPrice: doc.compareAtPrice,
    savingsPercentage: doc.savingsPercentage,
    status: doc.status as ComboStatus,
    featured: doc.featured,
    displayOrder: doc.displayOrder,
  };
}

function toCreateArgs(values: ComboFormValues) {
  return {
    businessUnitId: values.businessUnitId as any,
    name: values.name,
    slug: values.slug,
    description: values.description || undefined,
    images: values.imageUrl ? [values.imageUrl] : [],
    coverImage: values.imageUrl || undefined,
    items: values.items.map((item) => ({
      catalogItemId: item.catalogItemId as any,
      quantity: item.quantity,
    })),
    price: values.price,
    compareAtPrice: values.compareAtPrice
      ? Number(values.compareAtPrice)
      : undefined,
    savingsPercentage: values.savingsPercentage
      ? Number(values.savingsPercentage)
      : undefined,
    status: values.status,
    featured: values.featured,
    displayOrder: values.displayOrder,
  };
}

function toUpdateArgs(id: string, values: ComboFormValues) {
  return {
    id: id as any,
    name: values.name,
    slug: values.slug,
    description: values.description || undefined,
    images: values.imageUrl ? [values.imageUrl] : [],
    coverImage: values.imageUrl || undefined,
    items: values.items.map((item) => ({
      catalogItemId: item.catalogItemId as any,
      quantity: item.quantity,
    })),
    price: values.price,
    compareAtPrice: values.compareAtPrice
      ? Number(values.compareAtPrice)
      : undefined,
    savingsPercentage: values.savingsPercentage
      ? Number(values.savingsPercentage)
      : undefined,
    status: values.status,
    featured: values.featured,
    displayOrder: values.displayOrder,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CombosPage() {
  const { getSessionToken } = useAdminAuth();
  const allDocs = useQuery(api.combos.getAll);
  const allBUs = useQuery(api.businessUnits.getAll);
  const allCatalogItems = useQuery(api.catalogItems.getAll);
  const createCombo = useMutation(api.combos.create);
  const updateCombo = useMutation(api.combos.update);
  const softDeleteCombo = useMutation(api.combos.softDelete);
  const restoreCombo = useMutation(api.combos.restore);

  const isLoading =
    allDocs === undefined || allBUs === undefined || allCatalogItems === undefined;
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ComboFilters>({
    query: "",
    status: "all",
    businessUnitId: "all",
  });
  const [sortKey, setSortKey] = useState<ComboSortKey>("displayOrder");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<Combo>();
  const [deleteTarget, setDeleteTarget] = useState<Combo>();
  const [restoreTarget, setRestoreTarget] = useState<Combo>();

  const buMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of allBUs ?? []) map.set(bu._id, bu.name);
    return map;
  }, [allBUs]);

  const businessUnitOptions = useMemo(
    () => (allBUs ?? []).map((bu) => ({ id: bu._id, name: bu.name })),
    [allBUs]
  );

  const catalogItemOptions = useMemo(
    () =>
      (allCatalogItems ?? []).map((item) => ({
        id: item._id,
        businessUnitId: item.businessUnitId,
        name: item.name,
        price: item.price,
        itemType: item.itemType,
      })),
    [allCatalogItems]
  );

  const combos = useMemo(
    () => (allDocs ?? []).map((doc) => fromConvex(doc, buMap)),
    [allDocs, buMap]
  );

  const filteredCombos = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return combos.filter(
      (combo) =>
        (filters.status === "all" || combo.status === filters.status) &&
        (filters.businessUnitId === "all" ||
          combo.businessUnitId === filters.businessUnitId) &&
        (!query ||
          combo.name.toLowerCase().includes(query) ||
          combo.slug.toLowerCase().includes(query))
    );
  }, [combos, filters]);

  const sortedCombos = useMemo(
    () =>
      [...filteredCombos].sort((left, right) => {
        const leftValue = left[sortKey];
        const rightValue = right[sortKey];
        const comparison =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue));
        return sortDirection === "asc" ? comparison : -comparison;
      }),
    [filteredCombos, sortDirection, sortKey]
  );

  const pageCount = Math.max(1, Math.ceil(sortedCombos.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleCombos = sortedCombos.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const resetPageAndSetFilters = (nextFilters: ComboFilters) => {
    setFilters(nextFilters);
    setPage(1);
  };

  const handleSort = (nextKey: ComboSortKey) => {
    if (nextKey === sortKey)
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
  };

  const openCreateDialog = () => {
    setEditingCombo(undefined);
    setFormOpen(true);
  };

  const saveCombo = async (values: ComboFormValues) => {
    try {
      const token = getSessionToken();
      if (editingCombo) {
        await updateCombo({ ...toUpdateArgs(editingCombo.id, values), sessionToken: token! });
      } else {
        await createCombo({ ...toCreateArgs(values), sessionToken: token! });
      }
      setFormOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save combo"
      );
    }
  };

  const archiveCombo = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteCombo({ id: deleteTarget.id as any, sessionToken: getSessionToken()! });
      setDeleteTarget(undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to archive combo"
      );
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreCombo({ id: restoreTarget.id as any, sessionToken: getSessionToken()! });
      setRestoreTarget(undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to restore combo"
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Combos"
        description="Create product combos and deals across all business units."
      >
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1.5 size-4" />
          Add combo
        </Button>
      </PageHeader>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load combos</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {error}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setError(null)}
            >
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <section
          className="overflow-hidden rounded-xl border"
          aria-label="Combo management"
        >
          <ComboToolbar
            filters={filters}
            businessUnits={businessUnitOptions}
            onFiltersChange={resetPageAndSetFilters}
            onClear={() =>
              resetPageAndSetFilters({
                query: "",
                status: "all",
                businessUnitId: "all",
              })
            }
          />
          {isLoading ? (
            <ComboTable
              combos={[]}
              isLoading
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
              onEdit={() => undefined}
              onDelete={() => undefined}
              onRestore={() => undefined}
            />
          ) : visibleCombos.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No combos found"
              description={
                filteredCombos.length === 0 && combos.length > 0
                  ? "Try adjusting your search or filters."
                  : EMPTY_MESSAGES.COMBOS
              }
              action={
                combos.length === 0
                  ? { label: "Create combo", onClick: openCreateDialog }
                  : undefined
              }
            />
          ) : (
            <>
              <ComboTable
                combos={visibleCombos}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onEdit={(combo) => {
                  setEditingCombo(combo);
                  setFormOpen(true);
                }}
                onDelete={setDeleteTarget}
                onRestore={setRestoreTarget}
              />
              <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, sortedCombos.length)} of{" "}
                  {sortedCombos.length}
                </p>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setPage((current) => current - 1)}
                      >
                        Previous
                      </Button>
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-2" aria-live="polite">
                        Page {currentPage} of {pageCount}
                      </span>
                    </PaginationItem>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === pageCount}
                        onClick={() => setPage((current) => current + 1)}
                      >
                        Next
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </section>
      )}

      <ComboFormDialog
        open={formOpen}
        combo={editingCombo}
        businessUnits={businessUnitOptions}
        catalogItems={catalogItemOptions}
        onOpenChange={setFormOpen}
        onSubmit={saveCombo}
      />
      <ComboDialogs
        deleteTarget={deleteTarget}
        restoreTarget={restoreTarget}
        onDeleteOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        onRestoreOpenChange={(open) => {
          if (!open) setRestoreTarget(undefined);
        }}
        onConfirmDelete={archiveCombo}
        onConfirmRestore={confirmRestore}
      />
    </div>
  );
}
