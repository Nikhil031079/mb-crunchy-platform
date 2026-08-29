import { useMemo, useState } from "react";
import { AlertCircle, Package, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { MealDealDialogs } from "@/components/admin/meal-deals/MealDealDialogs";
import { MealDealFormDialog } from "@/components/admin/meal-deals/MealDealFormDialog";
import { MealDealTable } from "@/components/admin/meal-deals/MealDealTable";
import { MealDealToolbar } from "@/components/admin/meal-deals/MealDealToolbar";
import type {
  MealDealRecord,
  MealDealFilters,
  MealDealFormValues,
  MealDealSortKey,
  MealDealStatus,
  SortDirection,
} from "@/components/admin/meal-deals/types";
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

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromConvex(doc: any, buMap: Map<string, string>): MealDealRecord {
  return {
    id: doc._id,
    businessUnitId: doc.businessUnitId,
    businessUnitName: buMap.get(doc.businessUnitId) ?? "Unknown",
    name: doc.name,
    status: doc.status as MealDealStatus,
    dealPrice: doc.dealPrice,
    qualifyingItems: doc.qualifyingItems ?? [],
    applyToCombos: doc.applyToCombos ?? false,
    applyToPartyPacks: doc.applyToPartyPacks ?? false,
    parentCatalogItemIds: doc.parentCatalogItemIds,
    cartSmartDetection: doc.cartSmartDetection ?? false,
    displayOrder: doc.displayOrder ?? 0,
  };
}

function toCreateArgs(values: MealDealFormValues) {
  return {
    businessUnitId: values.businessUnitId as any,
    name: values.name,
    status: values.status,
    dealPrice: values.dealPrice,
    qualifyingItems: values.qualifyingItems.map((item) => ({
      catalogItemId: item.catalogItemId as any,
      quantity: item.quantity,
    })),
    applyToCombos: values.applyToCombos,
    applyToPartyPacks: values.applyToPartyPacks,
    parentCatalogItemIds: values.parentCatalogItemIds !== undefined
      ? values.parentCatalogItemIds.map((id) => id as any)
      : undefined,
    cartSmartDetection: values.cartSmartDetection,
    displayOrder: values.displayOrder,
  };
}

function toUpdateArgs(id: string, values: MealDealFormValues) {
  return {
    id: id as any,
    name: values.name,
    status: values.status,
    dealPrice: values.dealPrice,
    qualifyingItems: values.qualifyingItems.map((item) => ({
      catalogItemId: item.catalogItemId as any,
      quantity: item.quantity,
    })),
    applyToCombos: values.applyToCombos,
    applyToPartyPacks: values.applyToPartyPacks,
    parentCatalogItemIds: values.parentCatalogItemIds !== undefined
      ? values.parentCatalogItemIds.map((id) => id as any)
      : undefined,
    cartSmartDetection: values.cartSmartDetection,
    displayOrder: values.displayOrder,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function MealDealsPage() {
  const { getSessionToken } = useAdminAuth();
  const allDocs = useQuery(api.mealDeals.getAll);
  const allBUs = useQuery(api.businessUnits.getAll);
  const allCatalogItems = useQuery(api.catalogItems.getAll);
  const createMealDeal = useMutation(api.mealDeals.create);
  const updateMealDeal = useMutation(api.mealDeals.update);
  const softDeleteMealDeal = useMutation(api.mealDeals.softDelete);
  const restoreMealDeal = useMutation(api.mealDeals.restore);

  const isLoading =
    allDocs === undefined || allBUs === undefined || allCatalogItems === undefined;
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<MealDealFilters>({
    query: "",
    status: "all",
    businessUnitId: "all",
  });
  const [sortKey, setSortKey] = useState<MealDealSortKey>("displayOrder");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingMealDeal, setEditingMealDeal] = useState<MealDealRecord>();
  const [deleteTarget, setDeleteTarget] = useState<MealDealRecord>();
  const [restoreTarget, setRestoreTarget] = useState<MealDealRecord>();

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

  const mealDeals = useMemo(
    () => (allDocs ?? []).map((doc) => fromConvex(doc, buMap)),
    [allDocs, buMap]
  );

  const filteredMealDeals = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return mealDeals.filter(
      (deal) =>
        (filters.status === "all" || deal.status === filters.status) &&
        (filters.businessUnitId === "all" ||
          deal.businessUnitId === filters.businessUnitId) &&
        (!query || deal.name.toLowerCase().includes(query))
    );
  }, [mealDeals, filters]);

  const sortedMealDeals = useMemo(
    () =>
      [...filteredMealDeals].sort((left, right) => {
        const leftValue = left[sortKey];
        const rightValue = right[sortKey];
        const comparison =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue));
        return sortDirection === "asc" ? comparison : -comparison;
      }),
    [filteredMealDeals, sortDirection, sortKey]
  );

  const pageCount = Math.max(1, Math.ceil(sortedMealDeals.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleMealDeals = sortedMealDeals.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const resetPageAndSetFilters = (nextFilters: MealDealFilters) => {
    setFilters(nextFilters);
    setPage(1);
  };

  const handleSort = (nextKey: MealDealSortKey) => {
    if (nextKey === sortKey)
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
  };

  const openCreateDialog = () => {
    setEditingMealDeal(undefined);
    setFormOpen(true);
  };

  const saveMealDeal = async (values: MealDealFormValues) => {
    try {
      const token = getSessionToken();
      if (editingMealDeal) {
        await updateMealDeal({ ...toUpdateArgs(editingMealDeal.id, values), sessionToken: token! });
      } else {
        await createMealDeal({ ...toCreateArgs(values), sessionToken: token! });
      }
      setFormOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save meal deal"
      );
    }
  };

  const archiveMealDeal = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteMealDeal({ id: deleteTarget.id as any, sessionToken: getSessionToken()! });
      setDeleteTarget(undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to archive meal deal"
      );
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreMealDeal({ id: restoreTarget.id as any, sessionToken: getSessionToken()! });
      setRestoreTarget(undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to restore meal deal"
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="Meal Deals"
        description="Configure bundled meal deals and upgrade offers across all business units."
      >
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1.5 size-4" />
          Add meal deal
        </Button>
      </PageHeader>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load meal deals</AlertTitle>
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
          aria-label="Meal deal management"
        >
          <MealDealToolbar
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
            <MealDealTable
              mealDeals={[]}
              isLoading
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={handleSort}
              onEdit={() => undefined}
              onDelete={() => undefined}
              onRestore={() => undefined}
            />
          ) : visibleMealDeals.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No meal deals found"
              description={
                filteredMealDeals.length === 0 && mealDeals.length > 0
                  ? "Try adjusting your search or filters."
                  : EMPTY_MESSAGES.MEAL_DEALS
              }
              action={
                mealDeals.length === 0
                  ? { label: "Create meal deal", onClick: openCreateDialog }
                  : undefined
              }
            />
          ) : (
            <>
              <MealDealTable
                mealDeals={visibleMealDeals}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onEdit={(deal) => {
                  setEditingMealDeal(deal);
                  setFormOpen(true);
                }}
                onDelete={setDeleteTarget}
                onRestore={setRestoreTarget}
              />
              <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}-
                  {Math.min(currentPage * PAGE_SIZE, sortedMealDeals.length)} of{" "}
                  {sortedMealDeals.length}
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

      <MealDealFormDialog
        open={formOpen}
        mealDeal={editingMealDeal ? { ...editingMealDeal, id: editingMealDeal.id } : undefined}
        businessUnits={businessUnitOptions}
        catalogItems={catalogItemOptions}
        onOpenChange={setFormOpen}
        onSubmit={saveMealDeal}
      />
      <MealDealDialogs
        deleteTarget={deleteTarget}
        restoreTarget={restoreTarget}
        onDeleteOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        onRestoreOpenChange={(open) => {
          if (!open) setRestoreTarget(undefined);
        }}
        onConfirmDelete={archiveMealDeal}
        onConfirmRestore={confirmRestore}
      />
    </div>
  );
}
