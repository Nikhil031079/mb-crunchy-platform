import { useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Leaf,
  Truck,
  ArrowRight,
  Sparkles,
  ChefHat,
  BadgeCheck,
  Store,
  LayoutGrid,
} from "lucide-react";

import { api } from "@convex/_generated/api";

import { SITE_NAME } from "@/constants";
import { cn } from "@/lib/utils";
import { isContentActive, getContentMarketingSettings } from "@/utils";

// Customer Reusable Components
import {
  HeroSection,
  HeroSectionSkeleton,
  HomepageInfoStrip,
  RecommendedForYouSection,
  TodaySpecialsSection,
  ComboOffersSection,
  PartyPacksSection,
  BestSellersSection,
} from "@/components/customer";

// Modal
import { ItemDetailsModal } from "@/components/customer/ItemDetailsModal";

// Homepage composition (Phase 4B) — visual rearrangement only
import { DualHeroSection } from "@/components/customer/DualHeroSection";
import { HomepageFilterRail } from "@/components/customer/HomepageFilterRail";
import { CategoryNavBar } from "@/components/customer/CategoryNavBar";
// Homepage sections (Phase 4D) — visual recomposition only
import { PromoRibbonSection } from "@/components/customer/PromoRibbonSection";
import { MartGridSection } from "@/components/customer/MartGridSection";
import { TrendingRailSection } from "@/components/customer/TrendingRailSection";

// Shared components
import { CategoryCard } from "@/components/shared/CategoryCard";
import { getCategoryCatalog, enrichCategory } from "@/data/categories";

import type { EnrichedCategory } from "@/data/categories";

import type { BusinessUnit, Category, Content, CatalogItem } from "@/types";

// ============================================================================
// Trust items — compact brand trust band
// ============================================================================

interface TrustItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  color: string;
}

const TRUST_ITEMS: TrustItem[] = [
  {
    icon: ChefHat,
    title: "Fresh Food",
    description: "Prepared fresh, every single day",
    color: "text-orange-600 bg-orange-50 dark:bg-orange-950/50 dark:text-orange-400",
  },
  {
    icon: Leaf,
    title: "Organic Products",
    description: "Farm-fresh & naturally sourced",
    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400",
  },
  {
    icon: Truck,
    title: "Fast Local Delivery",
    description: "At your doorstep in minutes",
    color: "text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400",
  },
  {
    icon: Store,
    title: "Pickup",
    description: "Order online, collect in store",
    color: "text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400",
  },
  {
    icon: BadgeCheck,
    title: "Trusted Local Store",
    description: "Your neighbourhood favourite",
    color: "text-green-600 bg-green-50 dark:bg-green-950/50 dark:text-green-400",
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
  // Single aggregated query — returns all active categories across ALL BUs
  const allCategoriesRaw = useQuery(
    api.categories.getAllActiveAcrossBusinessUnits,
  ) as Category[] | undefined;

  const allCategories = useMemo(() => {
    if (!allCategoriesRaw) return [];
    return allCategoriesRaw.filter((c) => c.status === "active");
  }, [allCategoriesRaw]);

  if (isLoading || allCategories.length === 0) return null;

  return (
    <section id="categories" className="py-10 sm:py-12 scroll-mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LayoutGrid className="h-4 w-4 text-culinary-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-culinary-primary">
                Categories
              </span>
            </div>
            <h2 className="text-xl font-bold sm:text-2xl font-culinary-heading">Browse by Category</h2>
            <p className="mt-1 text-sm text-muted-foreground">Find exactly what you need</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {allCategories.slice(0, 6).map((cat, index) => {
            const bu = businessUnits.find((b) => b._id === cat.businessUnitId);
            const enriched = enrichCategory(cat, getCategoryCatalog(bu?.catalogMode)) as EnrichedCategory;
            return (
              <CategoryCard
                key={cat._id}
                category={enriched}
                businessUnitSlug={bu?.slug ?? ""}
                index={index}
                icon={enriched.catalog?.icon}
                gradient={enriched.catalog?.gradient}
                featured={enriched.catalog?.featured}
              />
            );
          })}
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
  const heroContent = useQuery(api.content.getByType, { contentType: "hero" }) as Content[] | undefined;

  const isLoading = businessUnits === undefined || heroContent === undefined;

  const activeBusinessUnits = useMemo(
    () =>
      (businessUnits ?? []).filter(
        (bu) => bu.status === "active" && bu.homepageVisible
      ),
    [businessUnits]
  );

  // --- Selected item state for universal ItemDetailsModal ---
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  // -----------------------------------------------------
  const navigate = useNavigate();

  // --- Phase 4B: Kitchen/Mart resolution for the dual hero + rails ---
  // catalogMode is authoritative; slugs mirror the pre-existing hero hrefs.
  const kitchenBU = useMemo(
    () =>
      activeBusinessUnits.find((b) => b.catalogMode === "food") ??
      activeBusinessUnits.find((b) => b.slug === "kitchen") ??
      null,
    [activeBusinessUnits],
  );
  const martBU = useMemo(
    () =>
      activeBusinessUnits.find((b) => b.catalogMode === "grocery") ??
      activeBusinessUnits.find((b) => b.slug === "mb-mart") ??
      null,
    [activeBusinessUnits],
  );

  // --- Phase 4B: category data for the homepage subcategory rail ---
  // Identical query to CategoriesSection below — deduped by the Convex
  // client. No selection state is created; taps navigate to the real
  // category page.
  const navCategoriesRaw = useQuery(
    api.categories.getAllActiveAcrossBusinessUnits,
  ) as Category[] | undefined;
  const navCategories = useMemo<EnrichedCategory[]>(
    () =>
      (navCategoriesRaw ?? [])
        .filter((c) => c.status === "active")
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((c) => {
          const bu = activeBusinessUnits.find((b) => b._id === c.businessUnitId);
          return enrichCategory(c, getCategoryCatalog(bu?.catalogMode)) as EnrichedCategory;
        }),
    [navCategoriesRaw, activeBusinessUnits],
  );
  const handleNavSelect = useCallback(
    (categoryId: string) => {
      const cat = navCategories.find((c) => c._id === categoryId);
      if (!cat) return;
      const bu = activeBusinessUnits.find((b) => b._id === cat.businessUnitId);
      if (!bu) return;
      navigate(`/${bu.slug}/${cat.slug}`);
    },
    [navCategories, activeBusinessUnits, navigate],
  );

  // Build hero banners dynamically from active hero content (date-valid).
  const heroBanners = useMemo(() => {
    const contentBanners = (heroContent ?? [])
      .filter((c) => c.status === "active" && isContentActive(c))
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => {
        const settings = getContentMarketingSettings(c);
        return {
          _id: c._id,
          title: c.title,
          subtitle: c.subtitle ?? c.body,
          description: c.body && c.subtitle ? c.body : undefined,
          backgroundImage: c.coverImage ?? c.images?.[0],
          mobileImage: settings.mobileImage,
          badge: c.buttonText ?? undefined,
          actions: c.buttonLink
            ? [{ label: c.buttonText ?? "Learn More", href: c.buttonLink, variant: "default" as const }]
            : undefined,
        };
      });

    return contentBanners.length > 0 ? contentBanners.slice(0, 5) : undefined;
  }, [heroContent]);

  // Default promotional slides shown when no admin-created banners exist
  const defaultPromoSlides = useMemo(() => {
    if (activeBusinessUnits.length === 0) return [];
    const bu0 = activeBusinessUnits[0];
    const bu1 = activeBusinessUnits[1];
    const slides = [
      {
        _id: "promo-fresh",
        badge: "Fresh & Fast",
        title: "Fresh Food Delivered Fast",
        subtitle: "Hot meals and fresh groceries at your doorstep in minutes.",
        gradient: "from-emerald-600 via-emerald-500 to-teal-600",
        actions: bu1
          ? [
              { label: `Explore ${bu0.name}`, href: `/${bu0.slug}`, variant: "default" as const },
              { label: `Shop ${bu1.name}`, href: `/${bu1.slug}`, variant: "outline" as const },
            ]
          : [
              { label: `Explore ${bu0.name}`, href: `/${bu0.slug}`, variant: "default" as const },
            ],
      },
      {
        _id: "promo-organic",
        badge: "100% Organic",
        title: "Organic Grocery Collection",
        subtitle: "Farm-fresh organic staples for your healthy everyday kitchen.",
        gradient: "from-green-600 via-green-500 to-lime-600",
        actions: bu1
          ? [{ label: `Shop ${bu1.name}`, href: `/${bu1.slug}`, variant: "default" as const }]
          : [{ label: `Explore ${bu0.name}`, href: `/${bu0.slug}`, variant: "default" as const }],
      },
      {
        _id: "promo-mojitos",
        badge: "Cool & Refreshing",
        title: "Refreshing Summer Favourites",
        subtitle: "Refreshing summer favourites at unbeatable prices.",
        gradient: "from-purple-600 via-fuchsia-500 to-pink-600",
        actions: [
          { label: `Explore ${bu0.name}`, href: `/${bu0.slug}`, variant: "default" as const },
        ],
      },
      {
        _id: "promo-combos",
        badge: "Party Time",
        title: "Combo Meals & Party Packs",
        subtitle: "Curated combos and party packs perfect for every occasion.",
        gradient: "from-amber-500 via-orange-500 to-red-600",
        actions: bu1
          ? [
              { label: `Explore ${bu0.name}`, href: `/${bu0.slug}`, variant: "default" as const },
              { label: `Shop ${bu1.name}`, href: `/${bu1.slug}`, variant: "outline" as const },
            ]
          : [
              { label: `Explore ${bu0.name}`, href: `/${bu0.slug}`, variant: "default" as const },
            ],
      },
    ];
    return slides;
  }, [activeBusinessUnits]);

  // --- Phase 4B: dual-hero inputs (existing CTAs, split per panel) ---
  const heroCtas = [
    { label: "Order from Kitchen", href: "/kitchen", variant: "default" as const },
    { label: "Shop Mart", href: "/mb-mart", variant: "outline" as const },
  ];
  const kitchenAction = heroCtas[0]
    ? { label: heroCtas[0].label, href: heroCtas[0].href }
    : null;
  const martAction = heroCtas[1]
    ? { label: heroCtas[1].label, href: heroCtas[1].href }
    : null;
  const showDualHero =
    !isLoading &&
    !heroBanners &&
    kitchenBU !== null &&
    martBU !== null &&
    kitchenBU._id !== martBU._id;

  return (
    // Culinary Tier 0 canvas (Phase 4) — warm homepage base.
    // Section order, data sources, and handlers unchanged.
    <div className="min-h-screen culinary-canvas">
      {/* ================================================================ */}
      {/* 1. HERO — Stitch dual Kitchen/Mart composition (Phase 4B).       */}
      {/*    Admin hero banners still render the existing carousel; the    */}
      {/*    dual hero recomposes the default state from the same data.    */}
      {/* ================================================================ */}

      {isLoading ? (
        <HeroSectionSkeleton />
      ) : heroBanners ? (
        <HeroSection
          title="Fresh Kitchen Favorites"
          subtitle="Everyday Mart Essentials"
          description="One destination for fresh prepared food and quality grocery products."
          badge="Your Favourite Stores, One Cart"
          size="lg"
          banners={heroBanners}
          businessUnits={activeBusinessUnits}
          actions={heroCtas}
        />
      ) : showDualHero ? (
        <DualHeroSection
          title="Fresh Kitchen Favorites"
          subtitle="Everyday Mart Essentials"
          description="One destination for fresh prepared food and quality grocery products."
          badge="Your Favourite Stores, One Cart"
          kitchenBU={kitchenBU}
          martBU={martBU}
          kitchenAction={kitchenAction}
          martAction={martAction}
          onOpenItemDetails={setSelectedItem}
        />
      ) : (
        <HeroSection
          title="Fresh Kitchen Favorites"
          subtitle="Everyday Mart Essentials"
          description="One destination for fresh prepared food and quality grocery products."
          badge="Your Favourite Stores, One Cart"
          size="lg"
          banners={defaultPromoSlides}
          businessUnits={activeBusinessUnits}
          actions={heroCtas}
        />
      )}

      {/* ================================================================ */}
      {/* 1B. FILTER/MODE RAIL + SUBCATEGORY RAIL (Phase 4B)               */}
      {/* ================================================================ */}

      {!isLoading && (kitchenBU || martBU) && (
        <HomepageFilterRail kitchenBU={kitchenBU} martBU={martBU} />
      )}

      {!isLoading && navCategories.length > 0 && (
        <CategoryNavBar
          categories={navCategories}
          activeId=""
          onSelect={handleNavSelect}
        />
      )}

      {/* ================================================================ */}
      {/* 2. CATEGORIES — Premium category grid from BU data              */}
      {/* ================================================================ */}

      {!isLoading && <CategoriesSection businessUnits={activeBusinessUnits} isLoading={isLoading} />}

      {/* ================================================================ */}
      {/* 3. POPULAR PRODUCTS — Best sellers across stores                 */}
      {/* ================================================================ */}

      {!isLoading && (
        <BestSellersSection businessUnits={activeBusinessUnits} />
      )}

      {/* ================================================================ */}
      {/* 3B. PROMO RIBBON — recomposed announcement/offer data (Phase 4D) */}
      {/* ================================================================ */}

      {!isLoading && <PromoRibbonSection />}

      {/* ================================================================ */}
      {/* 3C. MART GRID — dedicated Mart catalog section (Phase 4D)        */}
      {/* ================================================================ */}

      {!isLoading && martBU && (
        <MartGridSection martBU={martBU} onOpenItemDetails={setSelectedItem} />
      )}

      {/* ================================================================ */}
      {/* 4. TODAY'S SPECIALS — Featured picks across stores               */}
      {/* ================================================================ */}

      {!isLoading && <TodaySpecialsSection businessUnits={activeBusinessUnits} onOpenItemDetails={setSelectedItem} />}

      {/* ================================================================ */}
      {/* 5. EXPERIENCE CTA — early conversion, show Kitchen/Mart context  */}
      {/* ================================================================ */}

      {!isLoading && (
        <section className="py-10 sm:py-12">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-primary px-6 py-10 text-center text-primary-foreground shadow-[0_20px_40px_rgba(26,20,18,0.18)] sm:px-10 sm:py-12">
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/5" />
                <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-white/5" />
                <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(30rem_12rem_at_50%_0%,rgba(251,191,36,0.14),transparent_70%)]" />
              </div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="relative mx-auto max-w-2xl"
              >
                <Sparkles className="mx-auto mb-4 h-8 w-8 text-accent" aria-hidden />
                <h2 className="font-culinary-heading text-2xl font-bold sm:text-3xl">
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
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-medium backdrop-blur-md transition-all hover:bg-white/20"
                    >
                      {bu.logo ? (
                        <img src={bu.logo} alt={bu.name} className="h-5 w-5 rounded object-cover" />
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
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* 5. INFO STRIP — merged promo / announcement / trust points       */}
      {/* ================================================================ */}

      {!isLoading && <HomepageInfoStrip />}

      {/* ================================================================ */}
      {/* 6. RECOMMENDED FOR YOU — deterministic personalized picks         */}
      {/* ================================================================ */}

      {!isLoading && <RecommendedForYouSection businessUnits={activeBusinessUnits} onOpenItemDetails={setSelectedItem} />}

      {/* ================================================================ */}
      {/* 7. TRUST BAND — compact brand trust points                       */}
      {/* ================================================================ */}

      <section className="py-10 sm:py-12" aria-label="Why shop with us">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="glass-tier-1 rounded-3xl px-6 py-8 sm:px-8 sm:py-10">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-5 lg:gap-0 lg:divide-x lg:divide-culinary-outline-variant/50">
              {TRUST_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-center gap-3 lg:justify-center lg:px-6 lg:first:pl-0 lg:last:pr-0">
                    <div
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                        item.color
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold leading-tight font-culinary-heading">{item.title}</p>
                      <p className="text-xs text-muted-foreground leading-tight">
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 8. TRENDING RAIL — existing per-BU trending data (Phase 4D)      */}
      {/* ================================================================ */}

      {!isLoading && (
        <TrendingRailSection
          businessUnits={activeBusinessUnits}
          onOpenItemDetails={setSelectedItem}
        />
      )}

      {/* ================================================================ */}
      {/* UNIVERSAL ITEM DETAILS MODAL                                     */}
      {/* ================================================================ */}

      {selectedItem && <ItemDetailsModal selectedItem={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}