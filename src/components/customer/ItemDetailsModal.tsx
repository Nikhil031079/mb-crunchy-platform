import { useState, useCallback, useEffect, useMemo } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useCart } from "@/stores/cart";
import { useQuery } from "convex/react";

import { Dialog, DialogContent, DialogFooter, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle } from "@/components/ui/sheet";

import { cn } from "@/lib/utils";
import { formatCurrency, calculateDiscount } from "@/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import type { CatalogItem, CatalogItemType, Product, Combo, PartyPack } from "@/types";
import type { CartItem } from "@/types";

const DESKTOP_MAX_WIDTH = 768;

export interface ItemDetailsModalProps {
  selectedItem: CatalogItem | null;
  onClose: () => void;
}

export function ItemDetailsModal({
  selectedItem,
  onClose,
}: ItemDetailsModalProps) {
  const { addItem } = useCart();
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [isVariantOpen, setVariantOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);

  // Fetch the Product document using selectedItem.sourceId (links to product _id).
  // getByIds returns Product[] — extract [0] to get the single document.
  // Always call the hook (Rules of Hooks) — use "skip" when not applicable.
  const productResult = useQuery(
    api.products.getByIds,
    selectedItem?.itemType === "product" && selectedItem?.sourceId
      ? { ids: [selectedItem.sourceId as Id<"products">] }
      : "skip",
  );
  const product: Product | null = productResult?.[0] ?? null;

  // Fetch the Combo source document for its `items` array (not on CatalogItem)
  const comboResult = useQuery(
    api.combos.getByIds,
    selectedItem?.itemType === "combo" && selectedItem?.sourceId
      ? { ids: [selectedItem.sourceId as Id<"combos">] }
      : "skip",
  );
  const comboSource: Combo | null = comboResult?.[0] ?? null;

  // Fetch the PartyPack source document for its `items` array (not on CatalogItem)
  const partyPackResult = useQuery(
    api.partyPacks.getByIds,
    selectedItem?.itemType === "partyPack" && selectedItem?.sourceId
      ? { ids: [selectedItem.sourceId as Id<"partyPacks">] }
      : "skip",
  );
  const partyPackSource: PartyPack | null = partyPackResult?.[0] ?? null;

  // Resolve child item names for combo/partyPack contents via catalogItems
  const catalogItems = useQuery(
    api.catalogItems.getByBusinessUnit,
    selectedItem?.businessUnitId ? { businessUnitId: selectedItem.businessUnitId as Id<"businessUnits"> } : "skip",
  );

  const catalogById = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    for (const item of catalogItems ?? []) {
      map.set(item._id, item);
    }
    return map;
  }, [catalogItems]);

  // Early return AFTER all hooks (React rules)
  if (!selectedItem) return null;

  const isProduct = selectedItem.itemType === "product";
  const isCombo = selectedItem.itemType === "combo";
  const isPartyPack = selectedItem.itemType === "partyPack";

  // For combos/partyPacks, prefer source document data for image/description/fallback
  const combo = isCombo ? (comboSource ?? (selectedItem as any)) : (selectedItem as any);
  const partyPack = isPartyPack ? (partyPackSource ?? (selectedItem as any)) : (selectedItem as any);

  const productForVariant = product ?? (selectedItem as any);

  const variantGroups = useMemo(() => {
    if (!isProduct || !productForVariant?.variants) return [];
    return productForVariant.variants.map((v: any) => ({
      groupName: "variant",
      options: [{ optionName: v.optionValue, optionValue: v.optionValue, price: v.price, compareAtPrice: v.compareAtPrice, active: v.active }],
    }));
  }, [isProduct, productForVariant]);

  const activeVariants = useMemo(() => {
    if (!isProduct) return [];
    return productForVariant?.variants?.filter((v: any) => v.active) ?? [];
  }, [isProduct, productForVariant]);

  const minPrice = activeVariants.length > 0
    ? Math.min(...activeVariants.map((v: any) => v.price))
    : isProduct && product
      ? product.variants?.[0]?.price ?? 0
      : (selectedItem as any).price;

  // Authoritative selected-variant lookup for display and cart
  const selectedVariantData = useMemo(() => {
    if (!isProduct || !selectedVariant || !product?.variants) return undefined;
    return product.variants.find((v: any) => v.optionValue === selectedVariant);
  }, [isProduct, selectedVariant, product?.variants]);

  const displayedPrice = selectedVariantData?.price ?? minPrice;

  // Compare-at and discount from the SELECTED variant, not the first variant
  const compareAtPrice = isProduct
    ? selectedVariantData?.compareAtPrice
    : isProduct && "compareAtPrice" in (selectedItem as any)
      ? (selectedItem as any).compareAtPrice
      : undefined;
  const discount = compareAtPrice && compareAtPrice > displayedPrice ? calculateDiscount(displayedPrice, compareAtPrice) : 0;

  // Quantity-based totals for display
  const sellingTotal = displayedPrice * quantity;
  const compareAtTotal = compareAtPrice ? compareAtPrice * quantity : undefined;
  const savings = compareAtTotal && compareAtTotal > sellingTotal ? compareAtTotal - sellingTotal : 0;

  // --- Combo item resolution (uses source document's items array) ---
  const comboItemCounts = useMemo(() => {
    if (!isCombo || !comboSource?.items) return [];
    return comboSource.items.map((item: any) => {
      const resolved = catalogById.get(item.catalogItemId);
      return {
        catalogItemId: item.catalogItemId,
        quantity: item.quantity,
        name: resolved?.name ?? "Item unavailable",
      };
    });
  }, [isCombo, comboSource, catalogById]);

  // --- PartyPack item resolution (uses source document's items array) ---
  const partyPackItemCounts = useMemo(() => {
    if (!isPartyPack || !partyPackSource?.items) return [];
    return partyPackSource.items.map((item: any) => {
      const resolved = catalogById.get(item.catalogItemId);
      return {
        catalogItemId: item.catalogItemId,
        quantity: item.quantity,
        name: resolved?.name ?? "Item unavailable",
      };
    });
  }, [isPartyPack, partyPackSource, catalogById]);

  const handleAddToCart = useCallback(async () => {
    if (!selectedItem?.businessUnitId) return;

    let catalogItemId: string;
    let itemType: CatalogItemType;
    let name: string;
    let variantName: string;
    let quantityToAdd: number;
    let unitPrice: number;
    let image: string | undefined;
    let bundleItems: Array<{ name: string; quantity: number }> | undefined;

    if (isProduct) {
      catalogItemId = selectedItem._id;
      itemType = "product";
      name = selectedItem.name;
      variantName = selectedVariant ?? "Default";
      quantityToAdd = quantity;
      const variantData = selectedVariant
        ? product?.variants?.find((v: any) => v.optionValue === selectedVariant)
        : undefined;
      unitPrice = variantData?.price ?? minPrice;
      image = product?.coverImage || selectedItem.coverImage;
    } else if (isCombo) {
      catalogItemId = selectedItem._id;
      itemType = "combo";
      name = selectedItem.name;
      variantName = "Default";
      quantityToAdd = quantity;
      unitPrice = selectedItem.price;
      image = selectedItem.coverImage || selectedItem.thumbnail;
      const resolvedItems = comboSource?.items?.map((ci) => ({
        name: catalogById.get(ci.catalogItemId)?.name ?? "Item",
        quantity: ci.quantity,
      }));
      if (resolvedItems && resolvedItems.length > 0) bundleItems = resolvedItems;
    } else if (isPartyPack) {
      catalogItemId = selectedItem._id;
      itemType = "partyPack";
      name = selectedItem.name;
      variantName = "Default";
      quantityToAdd = quantity;
      unitPrice = selectedItem.price;
      image = selectedItem.coverImage || selectedItem.thumbnail;
      const resolvedItems = partyPackSource?.items?.map((pi) => ({
        name: catalogById.get(pi.catalogItemId)?.name ?? "Item",
        quantity: pi.quantity,
      }));
      if (resolvedItems && resolvedItems.length > 0) bundleItems = resolvedItems;
    } else {
      return;
    }

    const added = await addItem({
      catalogItemId,
      itemType,
      businessUnitId: selectedItem.businessUnitId,
      name,
      variantName,
      quantity: quantityToAdd,
      unitPrice,
      image,
      ...(bundleItems ? { bundleItems } : {}),
    });

    if (added) {
      setIsModalOpen(false);
      onClose();
    }
  }, [isProduct, isCombo, isPartyPack, product, comboSource, partyPackSource, catalogById, selectedVariant, quantity, minPrice, addItem, selectedItem, setIsModalOpen, onClose]);

  const handleOpenVariantSelector = useCallback(() => setVariantOpen(true), []);

  // Initialize selectedVariant to the first variant when product loads
  useEffect(() => {
    if (isProduct && product?.variants?.length && !selectedVariant) {
      setSelectedVariant(product.variants[0].optionValue);
    }
  }, [isProduct, product?.variants, selectedVariant]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !(event.target as any).closest(".variant-selector-wrapper")) {
        setVariantOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isMobile = window.innerWidth <= DESKTOP_MAX_WIDTH;
  const modalMode = isMobile ? "bottom-sheet" : "desktop";

  const renderProductContent = () => {
    const hasVariants = activeVariants.length > 0;
    const variantDisplay = hasVariants ? (
      <div className="mb-4">
        <label className="text-sm font-medium text-muted-underline">Variant</label>
        <div className="grid grid-cols-2 gap-2">
          {activeVariants.map((v: any) => (
            <div
              key={v.optionValue}
              className={cn("rounded border border-border/50 p-2 cursor-pointer select-none transition-colors hover:border-border", selectedVariant === v.optionValue && "border-primary bg-primary/10 text-primary", selectedVariant === v.optionValue && "bg-primary/20")}
              onClick={() => { setSelectedVariant(v.optionValue); setVariantOpen(false); }}
            >
              <span className="text-xs">{v.optionValue}</span>
              <span className="text-xs font-medium ml-2">{formatCurrency(v.price)}</span>
            </div>
          ))}
        </div>
      </div>
    ) : null;

    return (
      <div>
        {(product?.coverImage || (isProduct && productForVariant?.coverImage)) && <img src={product?.coverImage || productForVariant?.coverImage} alt={product?.name || productForVariant?.name} className="w-full h-48 object-cover rounded-lg mb-4" />}
        {(product?.name || (isProduct && productForVariant?.name)) && <h2 className="text-2xl font-bold tracking-tight mb-2">{product?.name || productForVariant?.name}</h2>}
        {product?.description && <p className="text-muted-foreground mb-4 line-clamp-3">{product.description}</p>}
        {variantDisplay}
        <div className="mb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{formatCurrency(sellingTotal)}</span>
            {compareAtTotal && compareAtTotal > sellingTotal && <span className="text-lg text-muted-foreground line-through">{formatCurrency(compareAtTotal)}</span>}
            {savings > 0 && <Badge variant="default" className="ml-2 text-[10px] font-bold px-2 py-1">You save {formatCurrency(savings)}</Badge>}
          </div>
          {quantity > 1 && (
            <p className="text-sm text-muted-foreground mt-1">{quantity} &times; {formatCurrency(displayedPrice)} / unit</p>
          )}
          {quantity === 1 && (
            <p className="text-sm text-muted-foreground mt-1">{formatCurrency(displayedPrice)} / unit</p>
          )}
        </div>
        <div className="mt-6">
          <label className="block text-sm font-medium mb-1">Quantity</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="rounded-l-md border border-border/50 px-3 py-1.5 text-sm hover:border-border" disabled={quantity <= 1}>−</button>
            <span className="min-w-[1.5rem] text-center text-xs font-bold tabular-nums">{quantity}</span>
            <button onClick={() => setQuantity((q) => q + 1)} className="rounded-r-md border border-border/50 px-3 py-1.5 text-sm hover:border-border">+</button>
          </div>
        </div>
        <Button size="lg" onClick={handleAddToCart} className="w-full gap-2 mt-4" disabled={!selectedVariant && isProduct}>
          <span className="flex items-center justify-center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M9 8l4 4L15 8"/></svg>Add to Cart</span>
        </Button>
      </div>
    );
  };

  const renderComboContent = () => (
    <div>
      {(combo.coverImage || combo.thumbnail) && <img src={combo.coverImage || combo.thumbnail} alt={combo.name} className="w-full h-48 object-cover rounded-lg mb-4" />}
      <h2 className="text-2xl font-bold tracking-tight mb-2">{combo.name}</h2>
      {combo.description && <p className="text-muted-foreground mb-4 line-clamp-3">{combo.description}</p>}
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground">{formatCurrency(combo.price)}</span>
          {combo.compareAtPrice && combo.compareAtPrice > combo.price && <span className="text-lg text-muted-foreground line-through">{formatCurrency(combo.compareAtPrice)}</span>}
          {discount > 0 && <Badge variant="default" className="ml-2 text-[10px] font-bold px-2 py-1">-{discount}% OFF</Badge>}
        </div>
      </div>
      {comboItemCounts.length > 0 && (
        <div className="mb-6"><p className="text-sm font-medium text-muted-foreground mb-2">Includes:</p><ul className="space-y-2 text-sm text-muted-foreground">{comboItemCounts.slice(0, 6).map((item: { catalogItemId: string; quantity: number; name: string }) => <li key={item.catalogItemId} className="flex items-center gap-2"><span className="w-2 h-2 rounded bg-emerald-600"></span><span>{item.quantity}x</span><span>{item.name}</span></li>)}{comboItemCounts.length > 6 && <li className="text-xs text-muted-foreground">+{comboItemCounts.length - 6} more items</li>}</ul></div>
      )}
      <Button size="lg" onClick={handleAddToCart} className="w-full gap-2 mt-4"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M9 8l4 4L15 8"/></svg>Add to Cart</Button>
    </div>
  );

  const renderPartyPackContent = () => (
    <div>
      {(partyPack.coverImage || partyPack.thumbnail) && <img src={partyPack.coverImage || partyPack.thumbnail} alt={partyPack.name} className="w-full h-48 object-cover rounded-lg mb-4" />}
      <h2 className="text-2xl font-bold tracking-tight mb-2">{partyPack.name}</h2>
      {partyPack.description && <p className="text-muted-foreground mb-4 line-clamp-3">{partyPack.description}</p>}
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground">{formatCurrency(partyPack.price)}</span>
          {partyPack.compareAtPrice && partyPack.compareAtPrice > partyPack.price && <span className="text-lg text-muted-foreground line-through">{formatCurrency(partyPack.compareAtPrice)}</span>}
          {discount > 0 && <Badge variant="default" className="ml-2 text-[10px] font-bold px-2 py-1">-{discount}% OFF</Badge>}
        </div>
      </div>
      {partyPackItemCounts.length > 0 && (
        <div className="mb-6"><p className="text-sm font-medium text-muted-foreground mb-2">Includes:</p><ul className="space-y-2 text-sm text-muted-foreground">{partyPackItemCounts.slice(0, 6).map((item: { catalogItemId: string; quantity: number; name: string }) => <li key={item.catalogItemId} className="flex items-center gap-2"><span className="w-2 h-2 rounded bg-sky-600"></span><span>{item.quantity}x</span><span>{item.name}</span></li>)}{partyPackItemCounts.length > 6 && <li className="text-xs text-muted-foreground">+{partyPackItemCounts.length - 6} more items</li>}</ul></div>
      )}
      {partyPackSource?.minServings !== undefined && <div className="mb-4 text-sm text-muted-foreground">Servings: {partyPackSource.minServings}–{partyPackSource.maxServings}</div>}
      <Button size="lg" onClick={handleAddToCart} className="w-full gap-2 mt-4"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M9 8l4 4L15 8"/></svg>Add to Cart</Button>
    </div>
  );

  let contentElement: React.ReactNode;

  if (isProduct) {
    contentElement = renderProductContent();
  } else if (isCombo) {
    contentElement = renderComboContent();
  } else if (isPartyPack) {
    contentElement = renderPartyPackContent();
  } else {
    contentElement = null;
  }

  // Desktop: DialogContent has built-in top-right X (showCloseButton defaults true).
  // Mobile: SheetContent has built-in top-right X.
  // One "Close" button at the bottom for both.
  return modalMode === "desktop" ? (
    <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) { setIsModalOpen(false); onClose(); } }}>
      <DialogOverlay />
      <DialogContent
        className={cn("prose max-w-none", "bg-background data-[state=open]:animate-in", "data-[state=closed]:animate-out", "data-[state=closed]:fade-out-0", "data-[state=open]:fade-in-0", "data-[state=closed]:zoom-out-95", "data-[state=open]:zoom-in-95", "fixed", "top-[50%]", "left-[50%]", "z-50", "grid", "w-full", "max-w-[calc(100%-2rem)]", "translate-x-[-50%]", "translate-y-[-50%]", "gap-4", "rounded-lg", "border", "p-6", "shadow-lg", "duration-200", "outline-none", "sm:max-w-lg")}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogTitle className="text-xl font-semibold">{selectedItem?.name}</DialogTitle>
        {contentElement}
        <DialogFooter className="flex flex-col-reverse gap-3">
          <Button variant="outline" onClick={() => { setIsModalOpen(false); onClose(); }} className="w-full sm:w-auto">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : (
    <Sheet open={isModalOpen} onOpenChange={(open) => { if (!open) { setIsModalOpen(false); onClose(); } }}>
      <SheetContent
        side="bottom"
        className="sm:max-w-lg"
      >
        <SheetHeader><SheetTitle>{selectedItem?.name}</SheetTitle></SheetHeader>
        <SheetFooter>
          {contentElement}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setIsModalOpen(false); onClose(); }}>Close</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
