import { useMemo, useState } from "react";
import { AlertCircle, Package, Plus, RefreshCw, Warehouse } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { BulkUpdateDialog } from "@/components/admin/inventory/BulkUpdateDialog";
import { InventoryDialogs } from "@/components/admin/inventory/InventoryDialogs";
import { InventoryFormDialog } from "@/components/admin/inventory/InventoryFormDialog";
import { InventoryTable } from "@/components/admin/inventory/InventoryTable";
import { InventoryToolbar } from "@/components/admin/inventory/InventoryToolbar";
import { StockAdjustmentDialog } from "@/components/admin/inventory/StockAdjustmentDialog";
import type { InventoryFilters, InventoryFormValues, InventoryRecord, InventorySortKey, SortDirection } from "@/components/admin/inventory/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { EMPTY_MESSAGES } from "@/constants";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function enrichInventory(
  doc: any,
  catalogMap: Map<string, { name: string; businessUnitId: string }>,
  buMap: Map<string, string>,
): InventoryRecord {
  const catalogInfo = catalogMap.get(doc.catalogItemId);
  const reserved = doc.reservedStock ?? 0;
  const available = doc.stockQuantity - reserved;
  const lowStock = doc.lowStockAlert !== undefined && doc.stockQuantity <= doc.lowStockAlert;

  let status: InventoryRecord["status"] = "in_stock";
  if (available <= 0) status = "out_of_stock";
  else if (lowStock) status = "low_stock";

  return {
    id: doc._id,
    catalogItemId: doc.catalogItemId,
    businessUnitId: doc.businessUnitId,
    businessUnitName: buMap.get(doc.businessUnitId) ?? "Unknown",
    itemName: catalogInfo?.name ?? "Unknown Item",
    variantName: doc.variantName,
    sku: doc.sku,
    barcode: doc.barcode,
    stockQuantity: doc.stockQuantity,
    reservedStock: reserved,
    availableStock: available,
    lowStockAlert: doc.lowStockAlert,
    costPrice: doc.costPrice,
    supplier: doc.supplier,
    location: doc.location,
    lastRestocked: doc.lastRestocked,
    expiryDate: doc.expiryDate,
    available: doc.available,
    status,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Dashboard summary card
// ---------------------------------------------------------------------------

function SummaryCard({ title, value, icon: Icon, className }: { title: string; value: string | number; icon: React.ComponentType<{ className?: string }>; className?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("size-4 text-muted-foreground", className)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InventoryPage() {
  const { getSessionToken } = useAdminAuth();
  const allInventory = useQuery(api.inventory.getAll);
  const allCatalogItems = useQuery(api.catalogItems.getAll);
  const allBUs = useQuery(api.businessUnits.getAll);
  const upsertInventory = useMutation(api.inventory.upsert);
  const adjustStock = useMutation(api.inventory.adjustStock);
  const bulkUpdateStock = useMutation(api.inventory.bulkUpdateStock);
  const softDeleteInventory = useMutation(api.inventory.softDelete);

  const isLoading = allInventory === undefined || allCatalogItems === undefined || allBUs === undefined;
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<InventoryFilters>({ query: "", status: "all", businessUnitId: "all" });
  const [sortKey, setSortKey] = useState<InventorySortKey>("itemName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryRecord>();
  const [adjustTarget, setAdjustTarget] = useState<InventoryRecord | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InventoryRecord | null>(null);

  // --- Maps ---
  const buMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of allBUs ?? []) map.set(bu._id, bu.name);
    return map;
  }, [allBUs]);

  const catalogMap = useMemo(() => {
    const map = new Map<string, { name: string; businessUnitId: string }>();
    for (const ci of allCatalogItems ?? []) map.set(ci._id, { name: ci.name, businessUnitId: ci.businessUnitId });
    return map;
  }, [allCatalogItems]);

  const buOptions = useMemo(() => (allBUs ?? []).map((bu) => ({ id: bu._id, name: bu.name })), [allBUs]);

  const catalogItemOptions = useMemo(
    () => (allCatalogItems ?? []).map((ci) => ({ id: ci._id, name: ci.name, businessUnitId: ci.businessUnitId })),
    [allCatalogItems],
  );

  // --- Enriched records ---
  const records = useMemo(
    () => (allInventory ?? []).map((doc) => enrichInventory(doc, catalogMap, buMap)),
    [allInventory, catalogMap, buMap],
  );

  // --- Summary ---
  const summary = useMemo(() => {
    let totalStock = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let inventoryValue = 0;

    for (const r of records) {
      totalStock += r.stockQuantity;
      totalReserved += r.reservedStock;
      totalAvailable += r.availableStock;
      if (r.status === "low_stock") lowStockCount++;
      if (r.status === "out_of_stock") outOfStockCount++;
      if (r.costPrice) inventoryValue += r.stockQuantity * r.costPrice;
    }

    return { totalItems: records.length, totalStock, totalReserved, totalAvailable, lowStockCount, outOfStockCount, inventoryValue };
  }, [records]);

  // --- Filtering (supports name, SKU, barcode search) ---
  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return records.filter((r) => {
      if (filters.status !== "all" && r.status !== filters.status) return false;
      if (filters.businessUnitId !== "all" && r.businessUnitId !== filters.businessUnitId) return false;
      if (q) {
        const matchesName = r.itemName.toLowerCase().includes(q);
        const matchesVariant = r.variantName.toLowerCase().includes(q);
        const matchesSku = r.sku?.toLowerCase().includes(q) ?? false;
        const matchesBarcode = r.barcode?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesVariant && !matchesSku && !matchesBarcode) return false;
      }
      return true;
    });
  }, [records, filters]);

  // --- Sorting ---
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const cmp = typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal ?? "").localeCompare(String(bVal ?? ""));
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // --- Handlers ---
  const resetPageAndSetFilters = (f: InventoryFilters) => { setFilters(f); setPage(1); };
  const handleSort = (key: InventorySortKey) => {
    if (key === sortKey) setSortDirection((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("asc"); }
  };
  const openCreateDialog = () => { setEditingItem(undefined); setFormOpen(true); };

  const saveInventory = async (values: InventoryFormValues) => {
    try {
      await upsertInventory({
        catalogItemId: values.catalogItemId as any,
        businessUnitId: values.businessUnitId as any,
        variantName: values.variantName,
        sku: values.sku || undefined,
        barcode: values.barcode || undefined,
        stockQuantity: Number(values.stockQuantity) || 0,
        available: (Number(values.stockQuantity) || 0) > 0,
        lowStockAlert: values.lowStockAlert ? Number(values.lowStockAlert) : undefined,
        costPrice: values.costPrice ? Number(values.costPrice) : undefined,
        supplier: values.supplier || undefined,
        location: values.location || undefined,
        sessionToken: getSessionToken()!,
      });
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save inventory item");
    }
  };

  const handleAdjust = async (inventoryId: string, adjustment: number, reason: string) => {
    try {
      await adjustStock({ id: inventoryId as any, adjustment, reason: reason || undefined, sessionToken: getSessionToken()! });
      setAdjustTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to adjust stock");
    }
  };

  const handleBulkUpdate = async (updates: { inventoryId: string; stockQuantity: number }[], reason: string) => {
    try {
      await bulkUpdateStock({
        updates: updates.map((u) => ({ inventoryId: u.inventoryId as any, stockQuantity: u.stockQuantity })),
        reason: reason || undefined,
        sessionToken: getSessionToken()!,
      });
      setBulkOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bulk update stock");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteInventory({ id: deleteTarget.id as any, sessionToken: getSessionToken()! });
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete inventory item");
    }
  };

  // --- Low-stock items for bulk update ---
  const lowStockItems = useMemo(() => records.filter((r) => r.status === "low_stock" || r.status === "out_of_stock"), [records]);

  return (
    <div>
      <PageHeader title="Inventory" description="Manage stock levels across all business units.">
        <div className="flex gap-2">
          {lowStockItems.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
              Bulk Update ({lowStockItems.length})
            </Button>
          )}
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="mr-1.5 size-4" />Add item
          </Button>
        </div>
      </PageHeader>

      {/* Dashboard Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="Total Items" value={summary.totalItems} icon={Package} />
        <SummaryCard title="Total Stock" value={summary.totalStock} icon={Warehouse} />
        <SummaryCard title="Reserved" value={summary.totalReserved} icon={Warehouse} className="text-amber-600" />
        <SummaryCard title="Available" value={summary.totalAvailable} icon={Warehouse} className="text-emerald-600" />
        <SummaryCard title="Low Stock" value={summary.lowStockCount} icon={AlertCircle} className="text-amber-600" />
        <SummaryCard title="Out of Stock" value={summary.outOfStockCount} icon={AlertCircle} className="text-red-600" />
      </div>

      {summary.inventoryValue > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          Total inventory value: <span className="font-medium">₹{summary.inventoryValue.toLocaleString()}</span>
        </p>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not load inventory</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {error}
            <Button size="sm" variant="outline" onClick={() => setError(null)}>
              <RefreshCw className="size-4" />Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <section className="overflow-hidden rounded-xl border" aria-label="Inventory management">
          <InventoryToolbar
            filters={filters}
            businessUnits={buOptions}
            onFiltersChange={resetPageAndSetFilters}
            onClear={() => resetPageAndSetFilters({ query: "", status: "all", businessUnitId: "all" })}
          />
          {isLoading ? (
            <InventoryTable items={[]} isLoading sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onAdjust={() => undefined} onEdit={() => undefined} onDelete={() => undefined} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Warehouse}
              title="No inventory items found"
              description={filtered.length === 0 && records.length > 0 ? "Try adjusting your search or filters." : EMPTY_MESSAGES.INVENTORY}
              action={records.length === 0 ? { label: "Add inventory item", onClick: openCreateDialog } : undefined}
            />
          ) : (
            <>
              <InventoryTable
                items={visible}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
                onAdjust={setAdjustTarget}
                onEdit={(item) => { setEditingItem(item); setFormOpen(true); }}
                onDelete={setDeleteTarget}
              />
              <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length}</p>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button></PaginationItem>
                    <PaginationItem><span className="px-2" aria-live="polite">Page {currentPage} of {pageCount}</span></PaginationItem>
                    <PaginationItem><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button></PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </section>
      )}

      {/* Dialogs */}
      <InventoryFormDialog
        open={formOpen}
        item={editingItem}
        catalogItems={catalogItemOptions}
        businessUnits={buOptions}
        onOpenChange={setFormOpen}
        onSubmit={saveInventory}
      />
      <StockAdjustmentDialog
        open={Boolean(adjustTarget)}
        item={adjustTarget}
        onOpenChange={(o) => { if (!o) setAdjustTarget(null); }}
        onConfirm={handleAdjust}
      />
      <BulkUpdateDialog
        open={bulkOpen}
        items={lowStockItems}
        onOpenChange={setBulkOpen}
        onConfirm={handleBulkUpdate}
      />
      <InventoryDialogs
        deleteTarget={deleteTarget}
        onDeleteOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        onConfirmDelete={handleDelete}
      />
    </div>
  );
}
