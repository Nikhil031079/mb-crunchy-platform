import { useMemo, useState } from "react";
import { AlertCircle, Package, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";

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

/**
 * Client-side validation for party pack create/edit. Returns an error
 * message for the first problem found, or null when the values are valid.
 * Drafts may hold temporarily blank rows while editing, but Save is
 * blocked until every row is valid. Server checks in convex/partyPacks.ts
 * remain authoritative.
 */
export function validatePartyPackValues(values: PartyPackFormValues): string | null {
  if (!values.businessUnitId) return "Select a business unit.";
  if (!Number.isInteger(values.minServings) || values.minServings < 1) {
    return "Min servings must be a whole number of at least 1.";
  }
  if (!Number.isInteger(values.maxServings) || values.maxServings < 1) {
    return "Max servings must be a whole number of at least 1.";
  }
  if (values.minServings > values.maxServings) {
    return "Min servings must not exceed max servings.";
  }
  if (!Array.isArray(values.items) || values.items.length === 0) {
    return "Add at least one item to the party pack.";
  }
  for (let index = 0; index < values.items.length; index += 1) {
    const item = values.items[index];
    if (!item || !item.catalogItemId) {
      return `Item ${index + 1} must reference a valid product.`;
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return `Item ${index + 1} must have a whole quantity of at least 1.`;
    }
  }
  return null;
}

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
  const { getSessionToken } = useAdminAuth();
  const token = getSessionToken();
  const allDocs = useQuery(api.partyPacks.getAll, token ? { sessionToken: token } : "skip");
  const allBUs = useQuery(api.businessUnits.getAll);
  const allCatalogItems = useQuery(api.catalogItems.getAll);
  const createPartyPack = useMutation(api.partyPacks.create);
  const updatePartyPack = useMutation(api.partyPacks.update);
  const softDeletePartyPack = useMutation(api.partyPacks.softDelete);
  const restorePartyPack = useMutation(api.partyPacks.restore);

  const isLoading =
    allDocs === undefined || allBUs === undefined || allCatalogItems === undefined;
  // 19C: `error` is the list-level load error (query failures). Mutation
  // failures use `actionError` so the list stays mounted.
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ title: string; message: string } | null>(null);

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
  const [isSaving, setIsSaving] = useState(false);

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
        compareAtPrice: item.compareAtPrice,
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
    if (isSaving) return;
    const validationError = validatePartyPackValues(values);
    if (validationError) {
      setActionError({ title: "Could not save party pack", message: validationError });
      return;
    }
    setIsSaving(true);
    try {
      if (editingPartyPack) {
        await updatePartyPack({ ...toUpdateArgs(editingPartyPack.id, values), sessionToken: getSessionToken()! });
      } else {
        await createPartyPack({ ...toCreateArgs(values), sessionToken: getSessionToken()! });
      }
      setFormOpen(false);
    } catch (err) {
      setActionError({ title: "Could not save party pack", message: err instanceof Error ? err.message : "Failed to save party pack" });
    } finally {
      setIsSaving(false);
    }
  };

  const archivePartyPack = async () => {
    if (!deleteTarget) return;
    try {
      await softDeletePartyPack({ id: deleteTarget.id as any, sessionToken: getSessionToken()! });
      setDeleteTarget(undefined);
    } catch (err) {
      setActionError({ title: "Could not delete party pack", message: err instanceof Error ? err.message : "Failed to archive party pack" });
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restorePartyPack({ id: restoreTarget.id as any, sessionToken: getSessionToken()! });
      setRestoreTarget(undefined);
    } catch (err) {
      setActionError({ title: "Could not restore party pack", message: err instanceof Error ? err.message : "Failed to restore party pack" });
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

      {actionError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="size-4" />
          <AlertTitle>{actionError.title}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {actionError.message}
            <Button size="sm" variant="outline" onClick={() => setActionError(null)}>
              <RefreshCw className="size-3.5" /> Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

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
        isSaving={isSaving}
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
