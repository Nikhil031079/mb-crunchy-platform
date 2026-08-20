import { useMemo, useState } from "react";
import { AlertCircle, Package, Plus, RefreshCw } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";

import { ProductDialogs } from "@/components/admin/products/ProductDialogs";
import { ProductFormDialog } from "@/components/admin/products/ProductFormDialog";
import { ProductTable } from "@/components/admin/products/ProductTable";
import { ProductToolbar } from "@/components/admin/products/ProductToolbar";
import type { Product, ProductFilters, ProductFormValues, ProductSortKey, SortDirection } from "@/components/admin/products/types";
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
function fromConvex(doc: any, buMap: Map<string, string>, catMap: Map<string, string>): Product {
  const stockFromVariants = (doc.variants ?? []).reduce(
    (sum: number, v: any) => sum + (typeof v.stock === "number" ? v.stock : 0),
    0
  );
  return {
    id: doc._id,
    businessUnitId: doc.businessUnitId,
    businessUnitName: buMap.get(doc.businessUnitId) ?? "Unknown",
    categoryId: doc.categoryId,
    categoryName: catMap.get(doc.categoryId) ?? "Unknown",
    name: doc.name,
    slug: doc.slug,
    description: doc.description,
    imageUrl: doc.coverImage ?? doc.images?.[0] ?? undefined,
    images: doc.images ?? [],
    price: doc.variants?.[0]?.price ?? 0,
    compareAtPrice: doc.variants?.[0]?.compareAtPrice,
    variants: (doc.variants ?? []).map((v: any) => ({
      optionName: v.optionName ?? "",
      optionValue: v.optionValue ?? v.name ?? "Default",
      price: v.price ?? 0,
      compareAtPrice: v.compareAtPrice?.toString() ?? "",
      sku: v.sku ?? "",
      barcode: v.barcode ?? "",
      stock: v.stock?.toString() ?? "",
      costPrice: v.costPrice?.toString() ?? "",
      taxPercentage: v.taxPercentage?.toString() ?? "",
      image: v.image ?? "",
      minOrderQty: v.minOrderQty?.toString() ?? "",
      isDefault: v.isDefault ?? false,
      sortOrder: v.sortOrder ?? 0,
      active: v.active ?? true,
    })),
    stockTotal: stockFromVariants > 0 ? stockFromVariants : doc.stockQuantity,
    sku: doc.sku,
    stockQuantity: doc.stockQuantity,
    unit: doc.unit,
    vegNonVeg: doc.vegNonVeg,
    taxPercentage: doc.taxPercentage,
    available: doc.available,
    tags: doc.tags ?? [],
    status: doc.status,
    featured: doc.featured,
    displayOrder: doc.displayOrder,
    deletedAt: doc.deletedAt,
  };
}

function toCreateArgs(values: ProductFormValues) {
  const variants = values.hasVariants
    ? values.variants
        .filter((v) => v.optionValue.trim() !== "")
        .map((v, i) => ({
          optionName: v.optionName.trim(),
          optionValue: v.optionValue.trim(),
          price: v.price,
          compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : undefined,
          sku: v.sku || undefined,
          barcode: v.barcode || undefined,
          stock: v.stock ? Number(v.stock) : undefined,
          costPrice: v.costPrice ? Number(v.costPrice) : undefined,
          taxPercentage: v.taxPercentage ? Number(v.taxPercentage) : undefined,
          image: v.image || undefined,
          minOrderQty: v.minOrderQty ? Number(v.minOrderQty) : undefined,
          isDefault: v.isDefault,
          sortOrder: i,
          active: v.active,
        }))
    : [{
        optionName: "",
        optionValue: "Default",
        price: values.price,
        compareAtPrice: values.compareAtPrice ? Number(values.compareAtPrice) : undefined,
        isDefault: true,
        sortOrder: 0,
        active: true,
      }];

  return {
    businessUnitId: values.businessUnitId as any,
    categoryId: values.categoryId as any,
    name: values.name,
    slug: values.slug,
    description: values.description || undefined,
    images: values.images.map((url) => url.trim()).filter(Boolean),
    coverImage: values.images.find((url) => url.trim() !== "")?.trim() || undefined,
    variants,
    tags: values.tags ? values.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    sku: values.sku || undefined,
    stockQuantity: values.stockQuantity ? Number(values.stockQuantity) : undefined,
    unit: values.unit,
    vegNonVeg: values.vegNonVeg,
    taxPercentage: values.taxPercentage ? Number(values.taxPercentage) : undefined,
    available: values.available,
    status: values.status,
    featured: values.featured,
    displayOrder: values.displayOrder,
  };
}

function toUpdateArgs(id: string, values: ProductFormValues) {
  const variants = values.hasVariants
    ? values.variants
        .filter((v) => v.optionValue.trim() !== "")
        .map((v, i) => ({
          optionName: v.optionName.trim(),
          optionValue: v.optionValue.trim(),
          price: v.price,
          compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : undefined,
          sku: v.sku || undefined,
          barcode: v.barcode || undefined,
          stock: v.stock ? Number(v.stock) : undefined,
          costPrice: v.costPrice ? Number(v.costPrice) : undefined,
          taxPercentage: v.taxPercentage ? Number(v.taxPercentage) : undefined,
          image: v.image || undefined,
          minOrderQty: v.minOrderQty ? Number(v.minOrderQty) : undefined,
          isDefault: v.isDefault,
          sortOrder: i,
          active: v.active,
        }))
    : [{
        optionName: "",
        optionValue: "Default",
        price: values.price,
        compareAtPrice: values.compareAtPrice ? Number(values.compareAtPrice) : undefined,
        isDefault: true,
        sortOrder: 0,
        active: true,
      }];

  return {
    id: id as any,
    businessUnitId: values.businessUnitId as any,
    categoryId: values.categoryId as any,
    name: values.name,
    slug: values.slug,
    description: values.description || undefined,
    images: values.images.map((url) => url.trim()).filter(Boolean),
    coverImage: values.images.find((url) => url.trim() !== "")?.trim() || undefined,
    variants,
    tags: values.tags ? values.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    sku: values.sku || undefined,
    stockQuantity: values.stockQuantity ? Number(values.stockQuantity) : undefined,
    unit: values.unit,
    vegNonVeg: values.vegNonVeg,
    taxPercentage: values.taxPercentage ? Number(values.taxPercentage) : undefined,
    available: values.available,
    status: values.status,
    featured: values.featured,
    displayOrder: values.displayOrder,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProductsPage() {
  const { getSessionToken } = useAdminAuth();
  const token = getSessionToken();
  const allDocs = useQuery(api.products.getAll, token ? { sessionToken: token } : "skip");
  const allBUs = useQuery(api.businessUnits.getAll);
  const allCats = useQuery(api.categories.getAll);
  const createProd = useMutation(api.products.create);
  const updateProd = useMutation(api.products.update);
  const softDeleteProd = useMutation(api.products.softDelete);
  const restoreProd = useMutation(api.products.restore);

  const isLoading = allDocs === undefined || allBUs === undefined || allCats === undefined;
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ProductFilters>({ query: "", status: "all", businessUnitId: "all" });
  const [sortKey, setSortKey] = useState<ProductSortKey>("displayOrder");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product>();
  const [deleteTarget, setDeleteTarget] = useState<Product>();
  const [restoreTarget, setRestoreTarget] = useState<Product>();

  const buMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of allBUs ?? []) map.set(bu._id, bu.name);
    return map;
  }, [allBUs]);

  const catMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of allCats ?? []) map.set(cat._id, cat.name);
    return map;
  }, [allCats]);

  const businessUnitOptions = useMemo(() => (allBUs ?? []).map((bu) => ({ id: bu._id, name: bu.name })), [allBUs]);

  const categoryOptions = useMemo(() => (allCats ?? []).map((cat) => ({ id: cat._id, businessUnitId: cat.businessUnitId, name: cat.name })), [allCats]);

  const products = useMemo(() => (allDocs ?? []).map((doc) => fromConvex(doc, buMap, catMap)), [allDocs, buMap, catMap]);

  const filteredProducts = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return products.filter((prod) =>
      (filters.status === "all" || prod.status === filters.status)
      && (filters.businessUnitId === "all" || prod.businessUnitId === filters.businessUnitId)
      && (!query || prod.name.toLowerCase().includes(query) || prod.slug.toLowerCase().includes(query))
    );
  }, [products, filters]);

  const sortedProducts = useMemo(() => [...filteredProducts].sort((left, right) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];
    const comparison = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
    return sortDirection === "asc" ? comparison : -comparison;
  }), [filteredProducts, sortDirection, sortKey]);
  const pageCount = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleProducts = sortedProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetPageAndSetFilters = (nextFilters: ProductFilters) => { setFilters(nextFilters); setPage(1); };
  const handleSort = (nextKey: ProductSortKey) => { if (nextKey === sortKey) setSortDirection((direction) => direction === "asc" ? "desc" : "asc"); else { setSortKey(nextKey); setSortDirection("asc"); } };
  const openCreateDialog = () => { setEditingProduct(undefined); setFormOpen(true); };

  const saveProduct = async (values: ProductFormValues) => {
    try {
      const token = getSessionToken();
      if (editingProduct) {
        await updateProd({ ...toUpdateArgs(editingProduct.id, values), sessionToken: token! });
      } else {
        await createProd({ ...toCreateArgs(values), sessionToken: token! });
      }
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    }
  };

  const archiveProduct = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteProd({ id: deleteTarget.id as any, sessionToken: getSessionToken()! });
      setDeleteTarget(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive product");
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreProd({ id: restoreTarget.id as any, sessionToken: getSessionToken()! });
      setRestoreTarget(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore product");
    }
  };

  const toggleFeatured = async (product: Product) => {
    try {
      await updateProd({ id: product.id as Id<"products">, featured: !product.featured, sessionToken: getSessionToken()! });
      toast.success(product.featured ? "Removed from featured" : "Marked as featured", { description: product.name });
    } catch (err) {
      toast.error("Could not update featured", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  };

  const toggleAvailable = async (product: Product) => {
    try {
      await updateProd({ id: product.id as Id<"products">, available: !product.available, sessionToken: getSessionToken()! });
      toast.success(product.available ? "Product hidden" : "Product is now available", { description: product.name });
    } catch (err) {
      toast.error("Could not update availability", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  };

  return <div>
    <PageHeader title="Products" description="Manage your product catalog across all business units.">
      <Button size="sm" onClick={openCreateDialog}><Plus className="mr-1.5 size-4" />Add product</Button>
    </PageHeader>

    {error ? <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>Could not load products</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{error}<Button size="sm" variant="outline" onClick={() => setError(null)}><RefreshCw className="size-4" />Try again</Button></AlertDescription></Alert> : <section className="overflow-hidden rounded-xl border" aria-label="Product management">
      <ProductToolbar filters={filters} businessUnits={businessUnitOptions} onFiltersChange={resetPageAndSetFilters} onClear={() => resetPageAndSetFilters({ query: "", status: "all", businessUnitId: "all" })} />
      {isLoading ? <ProductTable products={[]} isLoading sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onEdit={() => undefined} onDelete={() => undefined} onRestore={() => undefined} onToggleFeatured={() => undefined} onToggleAvailable={() => undefined} /> : visibleProducts.length === 0 ? <EmptyState icon={Package} title="No products found" description={filteredProducts.length === 0 && products.length > 0 ? "Try adjusting your search or filters." : EMPTY_MESSAGES.PRODUCTS} action={products.length === 0 ? { label: "Create product", onClick: openCreateDialog } : undefined} /> : <>
        <ProductTable products={visibleProducts} sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} onEdit={(prod) => { setEditingProduct(prod); setFormOpen(true); }} onDelete={setDeleteTarget} onRestore={setRestoreTarget} onToggleFeatured={toggleFeatured} onToggleAvailable={toggleAvailable} />
        <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedProducts.length)} of {sortedProducts.length}</p><Pagination className="mx-0 w-auto"><PaginationContent><PaginationItem><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((current) => current - 1)}>Previous</Button></PaginationItem><PaginationItem><span className="px-2" aria-live="polite">Page {currentPage} of {pageCount}</span></PaginationItem><PaginationItem><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage((current) => current + 1)}>Next</Button></PaginationItem></PaginationContent></Pagination></div>
      </>}
    </section>}
    <ProductFormDialog open={formOpen} product={editingProduct} businessUnits={businessUnitOptions} categories={categoryOptions} onOpenChange={setFormOpen} onSubmit={saveProduct} />
    <ProductDialogs deleteTarget={deleteTarget} restoreTarget={restoreTarget} onDeleteOpenChange={(open) => { if (!open) setDeleteTarget(undefined); }} onRestoreOpenChange={(open) => { if (!open) setRestoreTarget(undefined); }} onConfirmDelete={archiveProduct} onConfirmRestore={confirmRestore} />
  </div>;
}
