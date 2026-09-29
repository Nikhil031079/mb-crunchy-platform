import { useMemo, useState } from "react";
import { AlertCircle, Flame, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAdminAuth } from "@/hooks/use-admin-auth";

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
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { getOfferMarketingSettings } from "@/utils";

const PAGE_SIZE = 8;

/**
 * Client-side validation for flash-sale create/edit. Returns an error
 * message for the first problem found, or null when the values are valid.
 * Server-side checks in convex/offers.ts remain authoritative.
 */
export function validateFlashSaleValues(values: OfferFormValues): string | null {
  if (!values.businessUnitId) return "Select a business unit.";
  const startsAt = new Date(values.startsAt).getTime();
  const endsAt = new Date(values.endsAt).getTime();
  if (Number.isNaN(startsAt) || Number.isNaN(endsAt)) return "Select a valid start and end date.";
  if (endsAt <= startsAt) return "End date must be after the start date.";
  if (values.discountType === "percentage" && (values.discountValue <= 0 || values.discountValue > 100)) {
    return "Percentage discount must be between 1 and 100.";
  }
  return null;
}

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
    settings: doc.settings,
  };
}

// 19B: shared homepage-visibility mapping (mirrors OffersPage.toSettingsArgs).
// Both create and update preserve the same visibility settings the form exposes.
function toSettingsArgs(values: OfferFormValues): Record<string, unknown> {
  const settings: Record<string, unknown> = {};
  if (values.featured) settings.featured = true;
  if (!values.homeVisible) settings.homeVisible = false;
  if (!values.categoryVisible) settings.categoryVisible = false;
  if (values.isFlashSale) settings.isFlashSale = true;
  if (values.flashSalePriority !== 0) settings.flashSalePriority = values.flashSalePriority;
  if (values.flashSaleFeatured) settings.flashSaleFeatured = true;
  return settings;
}

function toUpdateArgs(id: string, values: OfferFormValues) {
  // NOTE: applicableCatalogItemIds/applicableCategoryIds are intentionally
  // omitted so unrelated edits never erase existing targeting configuration.
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
    usageLimit: values.usageLimit ? Number(values.usageLimit) : undefined,
    displayOrder: values.displayOrder,
    status: values.status,
    banner: values.banner || undefined,
    settings: toSettingsArgs(values),
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
    settings: toSettingsArgs(values),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function FlashSalesPage() {
  const { getSessionToken } = useAdminAuth();
  const token = getSessionToken();
  const allDocs = useQuery(api.offers.getAll, token ? { sessionToken: token } : "skip");
  const allBUs = useQuery(api.businessUnits.getAll);
  const createOffer = useMutation(api.offers.create);
  const updateOffer = useMutation(api.offers.update);
  const softDeleteOffer = useMutation(api.offers.softDelete);
  const restoreOffer = useMutation(api.offers.restore);

  const isLoading = allDocs === undefined || allBUs === undefined;
  // 19C: `error` is the list-level load error (query failures). Mutation
  // failures use `actionError` so the list stays mounted.
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ title: string; message: string } | null>(null);

  const [filters, setFilters] = useState<OfferFilters>({ query: "", status: "all", businessUnitId: "all", flashSale: "all" });
  const [sortKey, setSortKey] = useState<OfferSortKey>("displayOrder");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer>();
  const [deleteTarget, setDeleteTarget] = useState<Offer>();
  const [restoreTarget, setRestoreTarget] = useState<Offer>();
  const [isSaving, setIsSaving] = useState(false);

  const buMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of allBUs ?? []) map.set(bu._id, bu.name);
    return map;
  }, [allBUs]);

  const businessUnitOptions = useMemo(
    () => (allBUs ?? []).map((bu) => ({ id: bu._id, name: bu.name })),
    [allBUs],
  );

  const flashOffers = useMemo(
    () => (allDocs ?? [])
      .filter((doc) => getOfferMarketingSettings(doc).isFlashSale)
      .map((doc) => fromConvex(doc, buMap)),
    [allDocs, buMap],
  );

  const filteredOffers = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return flashOffers.filter(
      (offer) =>
        (filters.status === "all" || offer.status === filters.status) &&
        (filters.businessUnitId === "all" || offer.businessUnitId === filters.businessUnitId) &&
        (!query || offer.title.toLowerCase().includes(query) || (offer.code && offer.code.toLowerCase().includes(query))),
    );
  }, [flashOffers, filters]);

  const sortedOffers = useMemo(
    () =>
      [...filteredOffers].sort((left, right) => {
        const leftSettings = getOfferMarketingSettings(left);
        const rightSettings = getOfferMarketingSettings(right);
        if (rightSettings.flashSalePriority !== leftSettings.flashSalePriority) {
          return rightSettings.flashSalePriority - leftSettings.flashSalePriority;
        }
        const leftValue = left[sortKey];
        const rightValue = right[sortKey];
        const comparison =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
        return sortDirection === "asc" ? comparison : -comparison;
      }),
    [filteredOffers, sortDirection, sortKey],
  );

  const pageCount = Math.max(1, Math.ceil(sortedOffers.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleOffers = sortedOffers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetPageAndSetFilters = (nextFilters: OfferFilters) => { setFilters(nextFilters); setPage(1); };

  const handleSort = (nextKey: OfferSortKey) => {
    if (nextKey === sortKey) setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else { setSortKey(nextKey); setSortDirection("asc"); }
  };

  const openCreateDialog = () => { setEditingOffer(undefined); setFormOpen(true); };

  const saveOffer = async (values: OfferFormValues) => {
    if (isSaving) return;
    const validationError = validateFlashSaleValues(values);
    if (validationError) {
      setActionError({ title: "Could not save flash sale", message: validationError });
      return;
    }
    setIsSaving(true);
    try {
      if (editingOffer) {
        await updateOffer({ ...toUpdateArgs(editingOffer.id, values), sessionToken: getSessionToken()! });
      } else {
        await createOffer({ ...toCreateArgs(values), sessionToken: getSessionToken()! });
      }
      setFormOpen(false);
    } catch (err) {
      setActionError({ title: "Could not save flash sale", message: err instanceof Error ? err.message : "Failed to save offer" });
    } finally {
      setIsSaving(false);
    }
  };

  const archiveOffer = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteOffer({ id: deleteTarget.id as Id<"offers">, sessionToken: getSessionToken()! });
      setDeleteTarget(undefined);
    } catch (err) {
      setActionError({ title: "Could not delete flash sale", message: err instanceof Error ? err.message : "Failed to archive offer" });
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreOffer({ id: restoreTarget.id as Id<"offers">, sessionToken: getSessionToken()! });
      setRestoreTarget(undefined);
    } catch (err) {
      setActionError({ title: "Could not restore flash sale", message: err instanceof Error ? err.message : "Failed to restore offer" });
    }
  };

  return (
    <div>
      <PageHeader
        title="Flash Sales"
        description="Time-boxed deals shown in the Flash Sales section of the homepage."
      >
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1.5 size-4" />
          Add flash sale
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
          <AlertTitle>Could not load flash sales</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {error}
            <Button size="sm" variant="outline" onClick={() => setError(null)}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <section className="overflow-hidden rounded-xl border" aria-label="Flash sale management">
          <OfferToolbar
            filters={filters}
            businessUnits={businessUnitOptions}
            onFiltersChange={resetPageAndSetFilters}
            onClear={() => resetPageAndSetFilters({ query: "", status: "all", businessUnitId: "all", flashSale: "all" })}
            showTypeFilter={false}
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
              icon={Flame}
              title="No flash sales"
              description="Mark an offer as a flash sale from the offers page (Homepage marketing → Flash sale item) to feature it here."
              action={{ label: "Create offer", onClick: openCreateDialog }}
            />
          ) : (
            <>
              <OfferTable
                offers={visibleOffers}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onEdit={(offer) => { setEditingOffer(offer); setFormOpen(true); }}
                onDelete={setDeleteTarget}
                onRestore={setRestoreTarget}
              />
              <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, sortedOffers.length)} of {sortedOffers.length}
                </p>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((c) => c - 1)}>Previous</Button></PaginationItem>
                    <PaginationItem><span className="px-2" aria-live="polite">Page {currentPage} of {pageCount}</span></PaginationItem>
                    <PaginationItem><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage((c) => c + 1)}>Next</Button></PaginationItem>
                  </PaginationContent>
                </Pagination>
                <div className="flex items-center gap-1.5 text-xs">
                  <Flame className="size-3.5 text-orange-500" />
                  <span>Sorted by flash sale priority, highest first.</span>
                </div>
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
        defaultFlashSale
        isSaving={isSaving}
      />
      <OfferDialogs
        deleteTarget={deleteTarget}
        restoreTarget={restoreTarget}
        onDeleteOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }}
        onRestoreOpenChange={(open) => { if (!open) setRestoreTarget(undefined); }}
        onConfirmDelete={archiveOffer}
        onConfirmRestore={confirmRestore}
      />
    </div>
  );
}
