import { useMemo, useState } from "react";
import { AlertCircle, Package, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { PartyPackDialogs } from "@/components/admin/party-packs/PartyPackDialogs";
import { PartyPackFormDialog } from "@/components/admin/party-packs/PartyPackFormDialog";
import { PartyPackTable } from "@/components/admin/party-packs/PartyPackTable";
import { PartyPackToolbar } from "@/components/admin/party-packs/PartyPackToolbar";
import type {
  PartyPack,
  PartyPackFilters,
  PartyPackFormValues,
  PartyPackSortKey,
  SortDirection,
} from "@/components/admin/party-packs/types";
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

const PAGE_SIZE = 8;

// ---------------------------------------------------------------------------
// Mapping helpers — keep Convex document shapes out of the UI layer
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromConvex(doc: any, buMap: Map<string, string>): PartyPack {
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
    minServings: doc.minServings,
    maxServings: doc.maxServings,
    price: doc.price,
    compareAtPrice: doc.compareAtPrice,
    status: doc.status,
    featured: doc.featured,
    displayOrder: doc.displayOrder,
  };
}

function toCreateArgs(values: PartyPackFormValues) {
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
    minServings: values.minServings,
    maxServings: values.maxServings,
    price: values.price,
    compareAtPrice: values.compareAtPrice
      ? Number(values.compareAtPrice)
      : undefined,
    status: values.status,
    featured: values.featured,
    displayOrder: values.displayOrder,
  };
}

function toUpdateArgs(id: string, values: PartyPackFormValues) {
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
    minServings: values.minServings,
    maxServings: values.maxServings,
    price: values.price,
    compareAtPrice: values.compareAtPrice
      ? Number(values.compareAtPrice)
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

export default function PartyPacksPage() {
  const allDocs = useQuery(api.partyPacks.getAll);
  const allBUs = useQuery(api.businessUnits.getAll);
  const allCatalogItems = useQuery(api.catalogItems.getAll);
  const createPartyPack = useMutation(api.partyPacks.create);
  const updatePartyPack = useMutation(api.partyPacks.update);
  const softDeletePartyPack = useMutation(api.partyPacks.softDelete);
  const restorePartyPack = useMutation(api.partyPacks.restore);

  const isLoading =
    allDocs === undefined || allBUs === undefined || allCatalogItems === undefined;
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<PartyPackFilters>({
    query: "",
    status: "all",
    businessUnitId: "all",
  });
  const [sortKey, setSortKey] = useState<PartyPackSortKey>("displayOrder");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPartyPack, setEditingPartyPack] = useState<PartyPack>();
  const [deleteTarget, setDeleteTarget] = useState<PartyPack>();
  const [restoreTarget, setRestoreTarget] = useState<PartyPack>();

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

  const partyPacks = useMemo(
    () => (allDocs ?? []).map((doc) => fromConvex(doc, buMap)),
    [allDocs, buMap]
  );

  const filteredPartyPacks = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return partyPacks.filter(
      (pack) =>
        (filters.status === "all" || pack.status === filters.status) &&
        (filters.businessUnitId === "all" ||
          pack.businessUnitId === filters.businessUnitId) &&
        (!query ||
          pack.name.toLowerCase().includes(query) ||
          pack.slug.toLowerCase().includes(query))
    );
  }, [partyPacks, filters]);

  const sortedPartyPacks = useMemo(
    () =>
      [...filteredPartyPacks].sort((left, right) => {
        const leftValue = left[sortKey];
        const rightValue = right[sortKey];
        const comparison =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue));
        return sortDirection === "asc" ? comparison : -comparison;
      }),
    [filteredPartyPacks, sortDirection, sortKey]
  );

  const pageCount = Math.max(
    1,
    Math.ceil(sortedPartyPacks.length / PAGE_SIZE)
  );
  const currentPage = Math.min(page, pageCount);
  const visiblePartyPacks = sortedPartyPacks.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const resetPageAndSetFilters = (nextFilters: PartyPackFilters) => {
    setFilters(nextFilters);
    setPage(1);
  };

  const handleSort = (nextKey: PartyPackSortKey) => {
    if (nextKey === sortKey)
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
  };

  const openCreateDialog = () => {
    setEditingPartyPack(undefined);
    setFormOpen(true);
  };

  const savePartyPack = async (values: PartyPackFormValues) => {
    try {
      if (editingPartyPack) {
        await updatePartyPack(toUpdateArgs(editingPartyPack.id, values));
      } else {
        await createPartyPack(toCreateArgs(values));
      }
      setFormOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save party pack"
      );
    }
  };

  const archivePartyPack = async () => {
    if (!deleteTarget) return;
    try {
      await softDeletePartyPack({ id: deleteTarget.id as any });
      setDeleteTarget(undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to archive party pack"
      );
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restorePartyPack({ id: restoreTarget.id as any });
      setRestoreTarget(undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to restore party pack"
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Party Packs"
        description="Configure party packs for events across all business units."
      >
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1.5 size-4" />
          Add party pack
        </Button>
      </PageHeader>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load party packs</AlertTitle>
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
          aria-label="Party pack management"
        >
          <PartyPackToolbar
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
            <PartyPackTable
              partyPacks={[]}
              isLoading
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
              onEdit={() => undefined}
              onDelete={() => undefined}
              onRestore={() => undefined}
            />
          ) : visiblePartyPacks.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No party packs found"
              description={
                filteredPartyPacks.length === 0 && partyPacks.length > 0
                  ? "Try adjusting your search or filters."
                  : EMPTY_MESSAGES.PARTY_PACKS
              }
              action={
                partyPacks.length === 0
                  ? { label: "Create party pack", onClick: openCreateDialog }
                  : undefined
              }
            />
          ) : (
            <>
              <PartyPackTable
                partyPacks={visiblePartyPacks}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onEdit={(pack) => {
                  setEditingPartyPack(pack);
                  setFormOpen(true);
                }}
                onDelete={setDeleteTarget}
                onRestore={setRestoreTarget}
              />
              <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(
                    currentPage * PAGE_SIZE,
                    sortedPartyPacks.length
                  )}{" "}
                  of {sortedPartyPacks.length}
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

      <PartyPackFormDialog
        open={formOpen}
        partyPack={editingPartyPack}
        businessUnits={businessUnitOptions}
        catalogItems={catalogItemOptions}
        onOpenChange={setFormOpen}
        onSubmit={savePartyPack}
      />
      <PartyPackDialogs
        deleteTarget={deleteTarget}
        restoreTarget={restoreTarget}
        onDeleteOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        onRestoreOpenChange={(open) => {
          if (!open) setRestoreTarget(undefined);
        }}
        onConfirmDelete={archivePartyPack}
        onConfirmRestore={confirmRestore}
      />
    </div>
  );
}
