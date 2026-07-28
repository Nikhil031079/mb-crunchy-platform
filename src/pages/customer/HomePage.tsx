import { useMemo, useCallback, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Leaf,
  ShoppingBag,
  ShoppingCart,
  Truck,
  ShieldCheck,
  Zap,
  ArrowRight,
  Sparkles,
  Utensils,
  Package,
  Clock,
  ChevronRight,
  Percent,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { SITE_NAME, SITE_DESCRIPTION } from "@/constants";
import { cn } from "@/lib/utils";
import { useCart } from "@/stores/cart";
import { useAuth } from "@/hooks/use-auth";

// Customer Reusable Components
import {
  HeroSection,
  SectionHeader,
  OfferBanner,
  ProductCard,
  ProductCardSkeleton,
  ComboCard,
  ComboCardSkeleton,
  PartyPackCard,
  PartyPackCardSkeleton,
  CardGridSkeleton,
} from "@/components/customer";

// Shared components
import { CategoryCard } from "@/components/shared/CategoryCard";
import { EmptyState } from "@/components/shared/EmptyState";

import type { BusinessUnit, Category, Combo, Offer, PartyPack, Content } from "@/types";

// ============================================================================
// Why Choose MB Crunchy — Static brand values
// ============================================================================

interface WhyChooseItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
}

const WHY_CHOOSE_ITEMS: WhyChooseItem[] = [
  {
    icon: Leaf,
    title: "Fresh Food",
    description: "Farm-fresh ingredients sourced daily for our Kitchen and Mart selections.",
    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50",
  },
  {
    icon: ShoppingBag,
    title: "Daily Grocery",
    description: "All your everyday essentials available under one roof, anytime.",
    color: "text-blue-600 bg-blue-50 dark:bg-blue-950/50",
  },
  {
    icon: ShoppingCart,
    title: "One Cart",
    description: "Mix items from Kitchen and Mart in a single order. One checkout, one delivery.",
    color: "text-accent bg-accent/5",
  },
  {
    icon: Truck,
    title: "Fast Delivery",
    description: "Swift and reliable delivery right to your doorstep, when you need it.",
    color: "text-amber-600 bg-amber-50 dark:bg-amber-950/50",
  },
  {
    icon: ShieldCheck,
    title: "Trusted Quality",
    description: "Every product meets our strict quality standards before reaching you.",
    color: "text-green-600 bg-green-50 dark:bg-green-950/50",
  },
  {
    icon: Zap,
    title: "Fast Service",
    description: "Quick order processing and responsive support to serve you better.",
    color: "text-purple-600 bg-purple-50 dark:bg-purple-950/50",
  },
];

// ============================================================================
// CategoriesSection — Premium category grid from BU data
// ============================================================================

function CategoriesSection({
  businessUnits,
  isLoading,
}: {
  businessUnits: BusinessUnit[];
  isLoading: boolean;
}) {
  // Fetch categories for each BU
  const cats0 = useQuery(
    api.categories.getByBusinessUnit,
    businessUnits[0]?._id
      ? { businessUnitId: businessUnits[0]._id as any }
      : "skip",
  ) as Category[] | undefined;

  const cats1 = useQuery(
    api.categories.getByBusinessUnit,
    businessUnits[1]?._id
      ? { businessUnitId: businessUnits[1]._id as any }
      : "skip",
  ) as Category[] | undefined;

  const allCategories = useMemo(() => {
    const cats = [...(cats0 ?? []), ...(cats1 ?? [])];
    return cats.filter((c) => c.status === "active");
  }, [cats0, cats1]);

  if (isLoading || allCategories.length === 0) return null;

  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">Browse by Category</h2>
            <p className="mt-1 text-sm text-muted-foreground">Find exactly what you need</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {allCategories.slice(0, 6).map((cat, index) => {
            const buSlug = businessUnits.find((b) => b._id === cat.businessUnitId)?.slug ?? "";
            return (
              <CategoryCard
                key={cat._id}
                category={cat}
                businessUnitSlug={buSlug}
                index={index}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// BusinessUnitSection — Per-BU child component with its own hooks
// ============================================================================

function BusinessUnitSection({
  bu,
  buIndex,
}: {
  bu: BusinessUnit;
  buIndex: number;
}) {
  const featuredProducts = useQuery(api.catalogItems.getFeatured, {
    businessUnitId: bu._id,
  });

  const combos = bu.enableCombos
    ? (useQuery(api.combos.getByBusinessUnit, {
        businessUnitId: bu._id,
      }) as Combo[] | undefined)
    : ([] as Combo[]);

  const partyPacks = bu.enablePartyPacks
    ? (useQuery(api.partyPacks.getByBusinessUnit, {
        businessUnitId: bu._id,
      }) as PartyPack[] | undefined)
    : ([] as PartyPack[]);

  const bestSellers = useQuery(api.catalogItems.getBestSellers, {
    businessUnitId: bu._id,
    limit: 8,
  });

  const navigate = useNavigate();
  const { addItem } = useCart();

  const handleAddToCart = useCallback(
    (product: any) => {
      const defaultVariant = product.variants?.[0];
      addItem({
        catalogItemId: product._id,
        itemType: "product",
        businessUnitId: bu._id,
        name: product.name,
        variantName: defaultVariant?.name ?? "Default",
        quantity: 1,
        unitPrice: product.price ?? defaultVariant?.price ?? 0,
        image: product.coverImage || product.thumbnail,
      });
      toast.success("Added to cart", {
        description: `${product.name}`,
      });
    },
    [addItem, bu._id]
  );

  const isDataLoaded =
    featuredProducts !== undefined &&
    combos !== undefined &&
    partyPacks !== undefined &&
    bestSellers !== undefined;

  const hasFeatured = featuredProducts && featuredProducts.length > 0;
  const hasCombos = combos && combos.length > 0;
  const hasPartyPacks = partyPacks && partyPacks.length > 0;
  const hasBestSellers = bestSellers && bestSellers.length > 0 && bestSellers.length !== (featuredProducts?.length ?? 0);

  if (!isDataLoaded) {
    return <BusinessUnitSectionSkeleton buIndex={buIndex} />;
  }

  if (!hasFeatured && !hasCombos && !hasPartyPacks && !hasBestSellers) return null;

  const buSlug = bu.slug;

  return (
    <section
      key={bu._id}
      className={cn("py-12 sm:py-16", buIndex % 2 === 1 && "bg-secondary/20")}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* BU Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {bu.logo ? (
              <img
                src={bu.logo}
                alt=""
                className="h-10 w-10 rounded-xl object-cover shadow-sm"
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl shadow-sm"
                style={{ backgroundColor: bu.themeColor || "#000" }}
              >
                {buIndex === 0 ? (
                  <Utensils className="h-5 w-5 text-white" />
                ) : (
                  <Package className="h-5 w-5 text-white" />
                )}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">{bu.name}</h2>
              {bu.description && (
                <p className="text-sm text-muted-foreground">{bu.description}</p>
              )}
            </div>
          </div>
          <Link
            to={`/${buSlug}`}
            className="hidden items-center gap-1 text-sm font-medium text-accent transition-colors hover:underline sm:flex"
          >
            View All
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Featured Products */}
        {hasFeatured && (
          <div className="mb-10">
            <SectionHeader
              title="Popular Items"
              subtitle="Our most-loved selections"
              action={{
                label: `Browse ${bu.name}`,
                onClick: () => (navigate(`/${buSlug}`)),
              }}
              size="sm"
            />
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {featuredProducts!.slice(0, 10).map((item: any, index: number) => (
                <ProductCard
                  key={item._id}
                  product={item}
                  businessUnitSlug={buSlug}
                  index={index}
                  compact
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>
          </div>
        )}

        {/* Best Sellers */}
        {hasBestSellers && (
          <div className="mb-10">
            <SectionHeader
              title="Best Sellers"
              subtitle="Top picks from our customers"
              action={{
                label: `Browse ${bu.name}`,
                onClick: () => (navigate(`/${buSlug}`)),
              }}
              size="sm"
            />
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {bestSellers!.slice(0, 10).map((item: any, index: number) => (
                <ProductCard
                  key={item._id}
                  product={item}
                  businessUnitSlug={buSlug}
                  index={index}
                  compact
                  onAddToCart={handleAddToCart}
                />
              ))}
            </div>
          </div>
        )}

        {/* Combos */}
        {hasCombos && (
          <div className="mb-10">
            <SectionHeader
              title={`${bu.name} Combos`}
              subtitle="Curated bundles at great value"
              action={{
                label: "View All Combos",
                onClick: () => (navigate(`/${buSlug}`)),
              }}
              size="sm"
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {combos!.slice(0, 4).map((combo, index) => (
                <ComboCard key={combo._id} combo={combo} index={index} />
              ))}
            </div>
          </div>
        )}

        {/* Party Packs */}
        {hasPartyPacks && (
          <div>
            <SectionHeader
              title={`${bu.name} Party Packs`}
              subtitle="Perfect for gatherings and events"
              action={{
                label: "View All Packs",
                onClick: () => (navigate(`/${buSlug}`)),
              }}
              size="sm"
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {partyPacks!.slice(0, 4).map((pack, index) => (
                <PartyPackCard key={pack._id} partyPack={pack} index={index} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// BusinessUnitSectionSkeleton
// ============================================================================

function BusinessUnitSectionSkeleton({ buIndex }: { buIndex: number }) {
  return (
    <section className={cn("py-12 sm:py-16", buIndex % 2 === 0 && "bg-secondary/20")}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-secondary" />
          <div className="space-y-2">
            <div className="h-6 w-32 animate-pulse rounded bg-secondary" />
            <div className="h-4 w-48 animate-pulse rounded bg-secondary" />
          </div>
        </div>
        <div className="mb-5">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="h-6 w-36 animate-pulse rounded bg-secondary" />
        </div>
        <CardGridSkeleton count={5} columns={4} type="product" />
      </div>
    </section>
  );
}

// ============================================================================
// RecentlyViewedSection
// ============================================================================

function RecentlyViewedSection() {
  const { user } = useAuth();
  const customer = useQuery(api.customers.getByAuthUser, {});

  const recentCollections = useQuery(
    api.collections.getByCustomerAndType,
    customer?._id
      ? { customerId: customer._id, collectionType: "recentlyViewed" }
      : "skip",
  );

  const recentIds = useMemo(() => {
    if (!recentCollections || recentCollections.length === 0) return [];
    return recentCollections
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 8)
      .map((c) => c.itemId as any);
  }, [recentCollections]);

  const recentItems = useQuery(
    api.catalogItems.getByIds,
    recentIds.length > 0 ? { ids: recentIds } : "skip",
  );

  const { addItem } = useCart();

  const handleAddToCart = useCallback(
    (product: any) => {
      const defaultVariant = product.variants?.[0];
      addItem({
        catalogItemId: product._id,
        itemType: "product",
        businessUnitId: product.businessUnitId,
        name: product.name,
        variantName: defaultVariant?.name ?? "Default",
        quantity: 1,
        unitPrice: product.price ?? defaultVariant?.price ?? 0,
        image: product.coverImage || product.thumbnail,
      });
      toast.success("Added to cart", { description: product.name });
    },
    [addItem],
  );

  if (!customer?._id || !recentItems || recentItems.length === 0) return null;

  return (
    <section className="bg-secondary/20 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Recently Viewed"
          subtitle="Items you've browsed recently"
          size="sm"
        />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {recentItems.slice(0, 10).map((item: any, index: number) => (
            <ProductCard
              key={item._id}
              product={item}
              index={index}
              compact
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// RecommendedSection
// ============================================================================

function RecommendedSection() {
  const { user } = useAuth();
  const customer = useQuery(api.customers.getByAuthUser, {});

  const recentCollections = useQuery(
    api.collections.getByCustomerAndType,
    customer?._id
      ? { customerId: customer._id, collectionType: "recentlyViewed" }
      : "skip",
  );

  const viewedBuIds = useMemo(() => {
    if (!recentCollections || recentCollections.length === 0) return [];
    const ids = new Set<string>();
    for (const c of recentCollections) {
      const buId = (c as Record<string, unknown>).businessUnitId;
      if (buId) ids.add(buId as string);
    }
    return Array.from(ids).slice(0, 3);
  }, [recentCollections]);

  const excludeIds = useMemo(() => {
    if (!recentCollections) return [];
    return recentCollections.map((c) => c.itemId as any);
  }, [recentCollections]);

  const rec0 = useQuery(
    api.catalogItems.getRecommended,
    viewedBuIds[0] ? { businessUnitId: viewedBuIds[0] as any, excludeIds, limit: 4 } : "skip",
  );
  const rec1 = useQuery(
    api.catalogItems.getRecommended,
    viewedBuIds[1] ? { businessUnitId: viewedBuIds[1] as any, excludeIds, limit: 4 } : "skip",
  );
  const rec2 = useQuery(
    api.catalogItems.getRecommended,
    viewedBuIds[2] ? { businessUnitId: viewedBuIds[2] as any, excludeIds, limit: 4 } : "skip",
  );

  const { addItem } = useCart();

  const handleAddToCart = useCallback(
    (product: any) => {
      const defaultVariant = product.variants?.[0];
      addItem({
        catalogItemId: product._id,
        itemType: "product",
        businessUnitId: product.businessUnitId,
        name: product.name,
        variantName: defaultVariant?.name ?? "Default",
        quantity: 1,
        unitPrice: product.price ?? defaultVariant?.price ?? 0,
        image: product.coverImage || product.thumbnail,
      });
      toast.success("Added to cart", { description: product.name });
    },
    [addItem],
  );

  const recommendedItems = useMemo(() => {
    const all = [...(rec0 ?? []), ...(rec1 ?? []), ...(rec2 ?? [])];
    const seen = new Set<string>();
    return all.filter((item: any) => {
      if (seen.has(item._id)) return false;
      seen.add(item._id);
      return true;
    }).slice(0, 10);
  }, [rec0, rec1, rec2]);

  if (!customer?._id || recommendedItems.length === 0) return null;

  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Recommended for You"
          subtitle="Based on your browsing history"
          size="sm"
        />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {recommendedItems.map((item: any, index: number) => (
            <ProductCard
              key={item._id}
              product={item}
              index={index}
              compact
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// HomePage Component
// ============================================================================

export default function HomePage() {
  const businessUnits = useQuery(api.businessUnits.getActive) as BusinessUnit[] | undefined;
  const allOffers = useQuery(api.offers.getAll) as Offer[] | undefined;
  const heroContent = useQuery(api.content.getByType, { contentType: "hero" }) as Content[] | undefined;

  const isLoading = businessUnits === undefined;

  const activeBusinessUnits = useMemo(
    () =>
      (businessUnits ?? []).filter(
        (bu) => bu.status === "active" && bu.homepageVisible
      ),
    [businessUnits]
  );

  const activeOffers = useMemo(
    () => (allOffers ?? []).filter((o) => o.status === "active"),
    [allOffers]
  );

  const scrollToSection = useCallback((elementId: string) => {
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Build hero banners from content + active offers
  const heroBanners = useMemo(() => {
    const contentBanners = (heroContent ?? []).map((c) => ({
      _id: c._id,
      title: c.title,
      subtitle: c.body ?? c.subtitle,
      backgroundImage: c.coverImage ?? c.images?.[0],
      badge: c.buttonText,
      actions: c.buttonLink
        ? [{ label: c.buttonText ?? "Learn More", href: c.buttonLink, variant: "default" as const }]
        : undefined,
    }));

    const offerBanners = activeOffers.slice(0, 5).map((offer) => ({
      _id: offer._id,
      title: offer.title,
      subtitle: offer.description,
      backgroundImage: offer.banner,
      badge: offer.discountType === "percentage"
        ? `${offer.discountValue}% OFF`
        : offer.discountType === "fixed"
        ? `₹${offer.discountValue} OFF`
        : "Special Offer",
      actions: [
        { label: "Shop Now", href: `/${activeBusinessUnits[0]?.slug ?? ""}`, variant: "default" as const },
      ],
    }));

    const merged = [...contentBanners, ...offerBanners];
    return merged.length > 0 ? merged.slice(0, 5) : undefined;
  }, [heroContent, activeOffers, activeBusinessUnits]);

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/* 1. HERO SECTION — Full-width rotating banner                     */}
      {/* ================================================================ */}

      {isLoading ? (
        <div className="flex min-h-[420px] sm:min-h-[480px] w-full animate-pulse items-center bg-secondary/50">
          <div className="mx-auto w-full max-w-2xl space-y-6 px-4">
            <div className="mx-auto h-6 w-32 rounded-full bg-secondary" />
            <div className="mx-auto h-12 w-3/4 rounded-lg bg-secondary" />
            <div className="mx-auto h-4 w-1/2 rounded bg-secondary" />
            <div className="flex justify-center gap-3 pt-4">
              <div className="h-12 w-36 rounded-full bg-secondary" />
              <div className="h-12 w-36 rounded-full bg-secondary" />
            </div>
          </div>
        </div>
      ) : (
        <HeroSection
          title={`Order Delicious Food & Essentials`}
          subtitle={`Fresh from the kitchen, straight to your door`}
          description={SITE_DESCRIPTION}
          badge="Your Favourite Stores, One Cart"
          size="lg"
          banners={heroBanners}
          businessUnits={activeBusinessUnits}
          actions={
            !heroBanners
              ? [
                  {
                    label: `Order from ${activeBusinessUnits[0]?.name ?? "Kitchen"}`,
                    href: `/${activeBusinessUnits[0]?.slug ?? "mb-kitchen"}`,
                    variant: "default",
                  },
                  ...(activeBusinessUnits.length > 1
                    ? [
                        {
                          label: `Order from ${activeBusinessUnits[1].name}`,
                          href: `/${activeBusinessUnits[1].slug}`,
                          variant: "outline" as const,
                        },
                      ]
                    : []),
                ]
              : undefined
          }
        />
      )}

      {/* ================================================================ */}
      {/* 2. BROWSE BY CATEGORY — Premium category grid                    */}
      {/* ================================================================ */}

      {!isLoading && <CategoriesSection businessUnits={activeBusinessUnits} isLoading={isLoading} />}

      {/* ================================================================ */}
      {/* 3. TODAY'S DEALS                                                 */}
      {/* ================================================================ */}

      {!isLoading && activeOffers.length > 0 && (
        <section id="todays-deals" className="py-12 sm:py-16 bg-gradient-to-b from-secondary/30 to-background">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Percent className="h-4 w-4 text-accent" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                    Deals
                  </span>
                </div>
                <h2 className="text-xl font-bold sm:text-2xl">Today's Best Deals</h2>
                <p className="mt-1 text-sm text-muted-foreground">Limited-time offers you don't want to miss</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeOffers.slice(0, 6).map((offer, index) => (
                <OfferBanner key={offer._id} banner={offer} index={index} variant="card" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* 4. PER-BUSINESS UNIT SECTIONS                                    */}
      {/* ================================================================ */}

      {!isLoading && activeBusinessUnits.length === 0 && (
        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <EmptyState
              title="Explore our services"
              description="Once business units are created, their products and offers will appear here."
              icon={Sparkles}
            />
          </div>
        </section>
      )}

      {activeBusinessUnits.map((bu, buIndex) => (
        <BusinessUnitSection key={bu._id} bu={bu} buIndex={buIndex} />
      ))}

      {isLoading && (
        <>
          {[1, 2].map((sectionIdx) => (
            <BusinessUnitSectionSkeleton key={sectionIdx} buIndex={sectionIdx} />
          ))}
        </>
      )}

      {/* ================================================================ */}
      {/* 5. RECENTLY VIEWED                                               */}
      {/* ================================================================ */}

      {!isLoading && <RecentlyViewedSection />}

      {/* ================================================================ */}
      {/* 6. RECOMMENDED FOR YOU                                           */}
      {/* ================================================================ */}

      {!isLoading && <RecommendedSection />}

      {/* ================================================================ */}
      {/* 7. WHY CHOOSE MB CRUNCHY                                        */}
      {/* ================================================================ */}

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-xl font-bold sm:text-2xl">
              Why Choose {SITE_NAME}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto">
              We're committed to delivering the best experience across every service
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_CHOOSE_ITEMS.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.35, delay: index * 0.06 }}
                  className="group"
                >
                  <div className="rounded-2xl border border-border/40 bg-card p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 hover:border-accent/20">
                    <div
                      className={cn(
                        "mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
                        item.color
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-sm">{item.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 8. FINAL CTA                                                     */}
      {/* ================================================================ */}

      <section className="relative overflow-hidden bg-primary py-16 text-primary-foreground sm:py-20">
        <div className="absolute inset-0">
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/5" />
          <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-white/5" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-2xl"
          >
            <Sparkles className="mx-auto mb-4 h-8 w-8 text-accent" />
            <h2 className="text-2xl font-bold sm:text-3xl">
              Ready to Experience {SITE_NAME}?
            </h2>
            <p className="mt-3 text-base text-primary-foreground/70">
              Browse our stores, explore our products, and enjoy seamless delivery right to your doorstep.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {activeBusinessUnits.map((bu) => (
                <Link
                  key={bu._id}
                  to={`/${bu.slug}`}
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-medium backdrop-blur-sm transition-all hover:bg-white/20"
                >
                  {bu.logo ? (
                    <img src={bu.logo} alt="" className="h-5 w-5 rounded object-cover" />
                  ) : (
                    <div
                      className="h-5 w-5 rounded"
                      style={{ backgroundColor: bu.themeColor || "#fff" }}
                    />
                  )}
                  {bu.name}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
