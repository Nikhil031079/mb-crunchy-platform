import { useMemo, useState } from "react";
import { AlertCircle, Package, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { OfferDialogs } from "@/components/admin/offers/OfferDialogs";
import { OfferFormDialog } from "@/components/admin/offers/OfferFormDialog";
import { OfferTable } from "@/components/admin/offers/OfferTable";
import { OfferToolbar } from "@/components/admin/offers/OfferToolbar";
import type {
  Offer,
  OfferFilters,
  OfferFormValues,
  OfferSortKey,
  SortDirection,
} from "@/components/admin/offers/types";
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
function fromConvex(doc: any, buMap: Map<string, string>): Offer {
  return {
    id: doc._id,
    businessUnitId: doc.businessUnitId,
    businessUnitName: buMap.get(doc.businessUnitId) ?? "Unknown",
    title: doc.title,
    description: doc.description,
    code: doc.code,
    discountType: doc.discountType,
    discountValue: doc.discountValue,
    minOrderValue: doc.minOrderValue,
    maxDiscount: doc.maxDiscount,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    usageLimit: doc.usageLimit,
    usedCount: doc.usedCount,
    status: doc.status,
    displayOrder: doc.displayOrder,
    banner: doc.banner,
  };
}

function toCreateArgs(values: OfferFormValues) {
  return {
    businessUnitId: values.businessUnitId as any,
    title: values.title,
    description: values.description || undefined,
    code: values.code || undefined,
    discountType: values.discountType,
    discountValue: values.discountValue,
    minOrderValue: values.minOrderValue ? Number(values.minOrderValue) : undefined,
    maxDiscount: values.maxDiscount ? Number(values.maxDiscount) : undefined,
    startsAt: new Date(values.startsAt).getTime(),
    endsAt: new Date(values.endsAt).getTime(),
    applicableCatalogItemIds: [],
    applicableCategoryIds: [],
    usageLimit: values.usageLimit ? Number(values.usageLimit) : undefined,
    displayOrder: values.displayOrder,
    status: values.status,
    banner: values.banner || undefined,
  };
}

function toUpdateArgs(id: string, values: OfferFormValues) {
  return {
    id: id as any,
    title: values.title,
    description: values.description || undefined,
    code: values.code || undefined,
    discountType: values.discountType,
    discountValue: values.discountValue,
    minOrderValue: values.minOrderValue ? Number(values.minOrderValue) : undefined,
    maxDiscount: values.maxDiscount ? Number(values.maxDiscount) : undefined,
    startsAt: new Date(values.startsAt).getTime(),
    endsAt: new Date(values.endsAt).getTime(),
    applicableCatalogItemIds: [],
    applicableCategoryIds: [],
    usageLimit: values.usageLimit ? Number(values.usageLimit) : undefined,
    displayOrder: values.displayOrder,
    status: values.status,
    banner: values.banner || undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OffersPage() {
  const allDocs = useQuery(api.offers.getAll);
  const allBUs = useQuery(api.businessUnits.getAll);
  const createOffer = useMutation(api.offers.create);
  const updateOffer = useMutation(api.offers.update);
  const softDeleteOffer = useMutation(api.offers.softDelete);
  const restoreOffer = useMutation(api.offers.restore);

  const isLoading = allDocs === undefined || allBUs === undefined;
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<OfferFilters>({
    query: "",
    status: "all",
    businessUnitId: "all",
  });
  const [sortKey, setSortKey] = useState<OfferSortKey>("displayOrder");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer>();
  const [deleteTarget, setDeleteTarget] = useState<Offer>();
  const [restoreTarget, setRestoreTarget] = useState<Offer>();

  const buMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of allBUs ?? []) map.set(bu._id, bu.name);
    return map;
  }, [allBUs]);

  const businessUnitOptions = useMemo(
    () => (allBUs ?? []).map((bu) => ({ id: bu._id, name: bu.name })),
    [allBUs]
  );

  const offers = useMemo(
    () => (allDocs ?? []).map((doc) => fromConvex(doc, buMap)),
    [allDocs, buMap]
  );

  const filteredOffers = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return offers.filter(
      (offer) =>
        (filters.status === "all" || offer.status === filters.status) &&
        (filters.businessUnitId === "all" ||
          offer.businessUnitId === filters.businessUnitId) &&
        (!query ||
          offer.title.toLowerCase().includes(query) ||
          (offer.code && offer.code.toLowerCase().includes(query)))
    );
  }, [offers, filters]);

  const sortedOffers = useMemo(
    () =>
      [...filteredOffers].sort((left, right) => {
        const leftValue = left[sortKey];
        const rightValue = right[sortKey];
        const comparison =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
        return sortDirection === "asc" ? comparison : -comparison;
      }),
    [filteredOffers, sortDirection, sortKey]
  );

  const pageCount = Math.max(1, Math.ceil(sortedOffers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleOffers = sortedOffers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const resetPageAndSetFilters = (nextFilters: OfferFilters) => {
    setFilters(nextFilters);
    setPage(1);
  };

  const handleSort = (nextKey: OfferSortKey) => {
    if (nextKey === sortKey)
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
  };

  const openCreateDialog = () => {
    setEditingOffer(undefined);
    setFormOpen(true);
  };

  const saveOffer = async (values: OfferFormValues) => {
    try {
      if (editingOffer) {
        await updateOffer(toUpdateArgs(editingOffer.id, values));
      } else {
        await createOffer(toCreateArgs(values));
      }
      setFormOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save offer"
      );
    }
  };

  const archiveOffer = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteOffer({ id: deleteTarget.id as any });
      setDeleteTarget(undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to archive offer"
      );
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreOffer({ id: restoreTarget.id as any });
      setRestoreTarget(undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to restore offer"
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Offers & Promotions"
        description="Create and manage promotional offers across all business units."
      >
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1.5 size-4" />
          Add offer
        </Button>
      </PageHeader>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load offers</AlertTitle>
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
          aria-label="Offer management"
        >
          <OfferToolbar
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
            <OfferTable
              offers={[]}
              isLoading
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
              onEdit={() => undefined}
              onDelete={() => undefined}
              onRestore={() => undefined}
            />
          ) : visibleOffers.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No offers found"
              description={
                filteredOffers.length === 0 && offers.length > 0
                  ? "Try adjusting your search or filters."
                  : EMPTY_MESSAGES.OFFERS
              }
              action={
                offers.length === 0
                  ? { label: "Create offer", onClick: openCreateDialog }
                  : undefined
              }
            />
          ) : (
            <>
              <OfferTable
                offers={visibleOffers}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onEdit={(offer) => {
                  setEditingOffer(offer);
                  setFormOpen(true);
                }}
                onDelete={setDeleteTarget}
                onRestore={setRestoreTarget}
              />
              <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, sortedOffers.length)} of{" "}
                  {sortedOffers.length}
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

      <OfferFormDialog
        open={formOpen}
        offer={editingOffer}
        businessUnits={businessUnitOptions}
        onOpenChange={setFormOpen}
        onSubmit={saveOffer}
      />
      <OfferDialogs
        deleteTarget={deleteTarget}
        restoreTarget={restoreTarget}
        onDeleteOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        onRestoreOpenChange={(open) => {
          if (!open) setRestoreTarget(undefined);
        }}
        onConfirmDelete={archiveOffer}
        onConfirmRestore={confirmRestore}
      />
    </div>
  );
}
