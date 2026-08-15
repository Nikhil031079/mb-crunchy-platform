import { useMemo, useState } from "react";
import { Link } from "react-router";
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
} from "@/components/customer";

// Modal
import { ItemDetailsModal } from "@/components/customer/ItemDetailsModal";

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
  // Fetch categories for each BU
  const cats0 = useQuery(
    api.categories.getByBusinessUnit,
    businessUnits[0]?._id
      ? { businessUnitId: businessUnits[0]._id }
      : "skip",
  ) as Category[] | undefined;

  const cats1 = useQuery(
    api.categories.getByBusinessUnit,
    businessUnits[1]?._id
      ? { businessUnitId: businessUnits[1]._id }
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
            <div className="flex items-center gap-2 mb-1">
              <LayoutGrid className="h-4 w-4 text-accent" />
              <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                Categories
              </span>
            </div>
            <h2 className="text-xl font-bold sm:text-2xl">Browse by Category</h2>
            <p className="mt-1 text-sm text-muted-foreground">Find exactly what you need</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {allCategories.slice(0, 6).map((cat, index) => {
            const buSlug = businessUnits.find((b) => b._id === cat.businessUnitId)?.slug ?? "";
            const enriched = enrichCategory(cat, getCategoryCatalog(buSlug)) as EnrichedCategory;
            return (
              <CategoryCard
                key={cat._id}
                category={enriched}
                businessUnitSlug={buSlug}
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
    const kitchenSlug = activeBusinessUnits[0]?.slug ?? "mb-kitchen";
    const martSlug = activeBusinessUnits[1]?.slug ?? "mb-mart";
    return [
      {
        _id: "promo-fresh",
        badge: "Fresh & Fast",
        title: "Fresh Food Delivered Fast",
        subtitle: "Hot meals and fresh groceries at your doorstep in minutes.",
        gradient: "from-emerald-600 via-emerald-500 to-teal-600",
        actions: [
          { label: "Explore Kitchen", href: `/${kitchenSlug}`, variant: "default" as const },
          { label: "Shop Mart", href: `/${martSlug}`, variant: "outline" as const },
        ],
      },
      {
        _id: "promo-organic",
        badge: "100% Organic",
        title: "Organic Grocery Collection",
        subtitle: "Farm-fresh organic staples for your healthy everyday kitchen.",
        gradient: "from-green-600 via-green-500 to-lime-600",
        actions: [
          { label: "Shop Mart", href: `/${martSlug}`, variant: "default" as const },
        ],
      },
      {
        _id: "promo-mojitos",
        badge: "Cool & Refreshing",
        title: "Mojitos Starting at ₹50",
        subtitle: "Refreshing summer favourites at unbeatable prices.",
        gradient: "from-purple-600 via-fuchsia-500 to-pink-600",
        actions: [
          { label: "Explore Kitchen", href: `/${kitchenSlug}`, variant: "default" as const },
        ],
      },
      {
        _id: "promo-combos",
        badge: "Party Time",
        title: "Combo Meals & Party Packs",
        subtitle: "Curated combos and party packs perfect for every occasion.",
        gradient: "from-amber-500 via-orange-500 to-red-600",
        actions: [
          { label: "Explore Kitchen", href: `/${kitchenSlug}`, variant: "default" as const },
          { label: "Shop Mart", href: `/${martSlug}`, variant: "outline" as const },
        ],
      },
    ];
  }, [activeBusinessUnits]);

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/* 1. HERO SECTION — Full-width rotating banner (dynamic content)   */}
      {/* ================================================================ */}

      {isLoading ? (
        <HeroSectionSkeleton />
      ) : (
        <HeroSection
          title="Fresh Food, Organic Groceries & Everyday Essentials"
          subtitle="Delicious snacks, refreshing beverages, natural groceries and daily essentials delivered to your doorstep."
          description="One destination for Frozen Foods, Organic Products, Fresh Beverages and Everyday Essentials."
          badge="Your Favourite Stores, One Cart"
          size="lg"
          banners={heroBanners ?? defaultPromoSlides}
          businessUnits={activeBusinessUnits}
        />
      )}

      {/* ================================================================ */}
      {/* 2. COMBO OFFERS — Global merchandising section              */}
      {/* ================================================================ */}
      <ComboOffersSection businessUnits={activeBusinessUnits} onOpenItemDetails={setSelectedItem} />

      {/* ================================================================ */}
      {/* 3. PARTY PACKS — Global merchandising section                */}
      {/* ================================================================ */}
      <PartyPacksSection businessUnits={activeBusinessUnits} onOpenItemDetails={setSelectedItem} />

      {/* ================================================================ */}
      {/* 3. EXPERIENCE CTA — below the hero for an early conversion       */}
      {/* ================================================================ */}

      {!isLoading && (
        <section className="relative overflow-hidden bg-primary py-12 text-primary-foreground sm:py-14">
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
      )}

      {/* ================================================================ */}
      {/* 4. INFO STRIP — merged promo / announcement / trust points       */}
      {/* ================================================================ */}

      {!isLoading && <HomepageInfoStrip />}

      {/* ================================================================ */}
      {/* 5. BROWSE BY CATEGORY — Premium category grid                    */}
      {/* ================================================================ */}

      {!isLoading && <CategoriesSection businessUnits={activeBusinessUnits} isLoading={isLoading} />}

      {/* ================================================================ */}
      {/* 6. TODAY'S SPECIALS — deduped featured products across stores    */}
      {/* ================================================================ */}

      {!isLoading && <TodaySpecialsSection businessUnits={activeBusinessUnits} onOpenItemDetails={setSelectedItem} />}

      {/* ================================================================ */}
      {/* 7. RECOMMENDED FOR YOU — deterministic personalized picks        */}
      {/* ================================================================ */}

      {!isLoading && <RecommendedForYouSection businessUnits={activeBusinessUnits} onOpenItemDetails={setSelectedItem} />}

      {/* ================================================================ */}
      {/* 8. TRUST BAND — compact brand trust points                       */}
      {/* ================================================================ */}

      <section className="border-t border-border/40 bg-secondary/20 py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
            {TRUST_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      item.color
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{item.title}</p>
                    <p className="text-xs text-muted-foreground leading-tight">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* UNIVERSAL ITEM DETAILS MODAL                                     */}
      {/* ================================================================ */}

      {selectedItem && <ItemDetailsModal selectedItem={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}