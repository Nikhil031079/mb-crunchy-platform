import { useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, LayoutGrid } from "lucide-react";

import { api } from "@convex/_generated/api";

import { SITE_NAME } from "@/constants";
import { isContentActive, getContentMarketingSettings } from "@/utils";
import { useHomepageSections } from "@/hooks/use-homepage-sections";
import type { MappedSectionType } from "@/hooks/use-homepage-sections";

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
import { TrendingRailSection } from "@/components/customer/TrendingRailSection";

// Shared components
import { CategoryCard, CategoryCardSkeleton } from "@/components/shared/CategoryCard";
import { getCategoryCatalog, enrichCategory } from "@/data/categories";

import type { EnrichedCategory } from "@/data/categories";

import type { BusinessUnit, Category, Content, CatalogItem } from "@/types";

// ============================================================================
// NOTE (Phase 21C): the inline TRUST_ITEMS band was removed here. It overlapped
// HomepageInfoStrip (Fast Delivery/Fresh Everyday vs Fast Local
// Delivery/Fresh Food) while carrying no unique customer job, so the homepage
// now keeps exactly ONE trust/brand layer — HomepageInfoStrip, which also
// surfaces live promotional chips. No third trust system was introduced.
// ============================================================================

// ============================================================================
// CategoriesSection — Premium category grid from BU data
//
// Phase 21C: every card links to /{businessUnitSlug}/{categorySlug}. A
// category whose store cannot be resolved is dropped instead of rendered
// with a missing or foreign store slug, so Kitchen categories can never land
// inside Mart (and vice versa).
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

  const resolved = useMemo(() => {
    if (!allCategoriesRaw) return null;
    const byId = new Map<string, BusinessUnit>(businessUnits.map((bu) => [bu._id, bu]));
    return allCategoriesRaw
      .filter((c) => c.status === "active")
      .filter((c) => byId.has(c.businessUnitId))
      .map((c) => ({ category: c, bu: byId.get(c.businessUnitId) as BusinessUnit }));
  }, [allCategoriesRaw, businessUnits]);

  // Lightweight skeleton while the shared category query is still landing —
  // keeps the section from popping in after first paint (Phase 21C).
  if (isLoading || resolved === null) {
    return (
      <section id="categories" className="py-10 sm:py-12 scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="mb-6 h-7 w-44 animate-pulse rounded bg-secondary" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <CategoryCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (resolved.length === 0) return null;

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
          {resolved.slice(0, 6).map(({ category, bu }, index) => {
            const enriched = enrichCategory(
              category,
              getCategoryCatalog(bu.catalogMode),
            ) as EnrichedCategory;
            return (
              <CategoryCard
                key={category._id}
                category={enriched}
                businessUnitSlug={bu.slug}
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

  // --- Phase 14A: admin Homepage Sections settings for the mapped slots ---
  // Merged per the approved rules (see use-homepage-sections.ts): a mapped
  // section is hidden only when an active store hid it, displayOrder is the
  // single source of truth, and missing configuration never changes the
  // existing composition.
  const homepageSections = useHomepageSections(activeBusinessUnits.map((bu) => bu._id));

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
  const navCategories = useMemo<EnrichedCategory[]>(() => {
    // Resolve each category against a live store first — a category whose
    // store is unknown is dropped so its pill can never route to a wrong or
    // missing business unit (Phase 21C).
    const byId = new Map<string, BusinessUnit>(activeBusinessUnits.map((b) => [b._id, b]));
    return (navCategoriesRaw ?? [])
      .filter((c) => c.status === "active")
      .filter((c) => byId.has(c.businessUnitId))
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => {
        const bu = byId.get(c.businessUnitId) as BusinessUnit;
        return enrichCategory(c, getCategoryCatalog(bu.catalogMode)) as EnrichedCategory;
      });
  }, [navCategoriesRaw, activeBusinessUnits]);
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

  // --- Phase 21C: hero CTAs are derived from the LIVE store slugs.
  // Nothing here hardcodes "/kitchen" or "/mb-mart" — a slug change in the
  // admin panel flows straight through to every hero destination.
  const kitchenAction = kitchenBU
    ? { label: "Order from Kitchen", href: `/${kitchenBU.slug}` }
    : null;
  const martAction = martBU
    ? { label: "Shop Mart", href: `/${martBU.slug}` }
    : null;
  const heroCtas = [
    ...(kitchenAction ? [{ ...kitchenAction, variant: "default" as const }] : []),
    ...(martAction ? [{ ...martAction, variant: "outline" as const }] : []),
  ];

  const showDualHero =
    !isLoading &&
    !heroBanners &&
    kitchenBU !== null &&
    martBU !== null &&
    kitchenBU._id !== martBU._id;

  // Phase 14A: renders one of the three admin-mapped components in its
  // assigned slot. An explicitly hidden type renders nothing in place, so
  // every other section keeps its position and no component ever renders
  // twice or disappears because configuration is missing.
  const renderMappedSection = (type: MappedSectionType) => {
    if (!homepageSections.visible[type]) return null;
    switch (type) {
      case "featuredProducts":
        return <BestSellersSection key={type} businessUnits={activeBusinessUnits} />;
      case "combos":
        return (
          <ComboOffersSection
            key={type}
            businessUnits={activeBusinessUnits}
            onOpenItemDetails={setSelectedItem}
          />
        );
      case "partyPacks":
        return (
          <PartyPacksSection
            key={type}
            businessUnits={activeBusinessUnits}
            onOpenItemDetails={setSelectedItem}
          />
        );
      default:
        return null;
    }
  };

  return (
    // Culinary Tier 0 canvas (Phase 4) — warm homepage base.
    // Phase 21C: section order now follows the discovery sequence
    // (hero → store rail → categories → products → offers → trust → CTA).
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
      {/* 2. STORE RAIL — filter/mode rail + subcategory rail (Phase 4B)   */}
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
      {/* 3. CATEGORIES — every card routes to /{bu}/{category}            */}
      {/* ================================================================ */}

      {!isLoading && <CategoriesSection businessUnits={activeBusinessUnits} isLoading={isLoading} />}

      {/* ================================================================ */}
      {/* 4. TODAY'S SPECIALS — featured picks across stores                */}
      {/* ================================================================ */}

      {!isLoading && <TodaySpecialsSection businessUnits={activeBusinessUnits} onOpenItemDetails={setSelectedItem} />}

      {/* ================================================================ */}
      {/* 5. TRENDING — renders nothing (heading included) without data     */}
      {/* ================================================================ */}

      {!isLoading && (
        <TrendingRailSection
          businessUnits={activeBusinessUnits}
          onOpenItemDetails={setSelectedItem}
        />
      )}

      {/* ================================================================ */}
      {/* 6. MAPPED SLOT 7 — Best Sellers, driven by the admin homepage     */}
      {/*    sections settings (Phase 14A). Renders first of the three       */}
      {/*    mapped slots, before the personalisation rail.                  */}
      {/* ================================================================ */}

      {!isLoading && renderMappedSection(homepageSections.orderedTypes[0])}

      {/* ================================================================ */}
      {/* 7. RECOMMENDED FOR YOU — deterministic personalized picks         */}
      {/* ================================================================ */}

      {!isLoading && (
        <RecommendedForYouSection
          businessUnits={activeBusinessUnits}
          onOpenItemDetails={setSelectedItem}
        />
      )}

      {/* ================================================================ */}
      {/* 8. MAPPED SLOTS 9 + 10 — Combos and Party Packs, ordered by the   */}
      {/*    admin homepage sections settings (Phase 14A). Both sections    */}
      {/*    return null when the store has no data, so nothing empty       */}
      {/*    renders.                                                       */}
      {/* ================================================================ */}

      {!isLoading && renderMappedSection(homepageSections.orderedTypes[1])}

      {!isLoading && renderMappedSection(homepageSections.orderedTypes[2])}

      {/* ================================================================ */}
      {/* 9. OFFERS RIBBON — only when an announcement, promo or live       */}
      {/*    flash offer is active (self-guarded)                           */}
      {/* ================================================================ */}

      {!isLoading && <PromoRibbonSection />}

      {/* ================================================================ */}
      {/* 10. ONE TRUST LAYER — the single brand/trust surface (21C).       */}
      {/*     Replaces the duplicated TRUST_ITEMS band.                     */}
      {/* ================================================================ */}

      {!isLoading && <HomepageInfoStrip />}

      {/* ================================================================ */}
      {/* 11. FINAL STORE CTA — one closing action into a canonical store  */}
      {/*      catalog (moved to the end in Phase 21C)                      */}
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
      {/* UNIVERSAL ITEM DETAILS MODAL                                     */}
      {/* ================================================================ */}

      {selectedItem && <ItemDetailsModal selectedItem={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}