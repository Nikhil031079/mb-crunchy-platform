import { useMemo } from "react";
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
  CreditCard,
  LayoutGrid,
} from "lucide-react";

import { api } from "@convex/_generated/api";

import { SITE_NAME } from "@/constants";
import { cn } from "@/lib/utils";
import { isContentActive, getContentMarketingSettings } from "@/utils";
import { useBrowsingPreference } from "@/hooks/use-browsing-preference";

// Customer Reusable Components
import {
  HeroSection,
  HeroSectionSkeleton,
  DeliveryInfoStrip,
  PromoBannerStrip,
  HappyHourBanner,
  FlashSalesSection,
  HomepageSectionRenderer,
  RecentlyViewedSection,
  ContinueShoppingSection,
  RecommendedForYouSection,
  TrendingNowSection,
  SeasonalSection,
} from "@/components/customer";

// Shared components
import { CategoryCard } from "@/components/shared/CategoryCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { getCategoryCatalog, enrichCategory } from "@/data/categories";

import type { EnrichedCategory } from "@/data/categories";

import type { BusinessUnit, Category, Content, HomepageSection } from "@/types";

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
    icon: ChefHat,
    title: "Freshly Prepared",
    description: "Meals and dishes prepared fresh, every single day for maximum taste.",
    color: "text-orange-600 bg-orange-50 dark:bg-orange-950/50 dark:text-orange-400",
  },
  {
    icon: Sparkles,
    title: "Premium Ingredients",
    description: "Carefully sourced, high-quality ingredients in every single product.",
    color: "text-purple-600 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-400",
  },
  {
    icon: Leaf,
    title: "Organic Products",
    description: "Farm-fresh organic groceries and natural staples, free of harmful chemicals.",
    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400",
  },
  {
    icon: Truck,
    title: "Fast Delivery",
    description: "Swift and reliable delivery right to your doorstep, when you need it.",
    color: "text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400",
  },
  {
    icon: CreditCard,
    title: "Secure Payments",
    description: "Multiple secure payment options — UPI, cards and more — fully protected.",
    color: "text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400",
  },
  {
    icon: BadgeCheck,
    title: "Quality Assured",
    description: "Every product meets our strict quality standards before reaching you.",
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

  // The primary business unit drives the homepage section layout ordering.
  const primaryBu = activeBusinessUnits[0];

  const { preferredBusinessUnitId } = useBrowsingPreference();

  // Prefer the shopper's preferred BU layout when available; fall back to the
  // primary BU. Sections themselves are ordered by priority + preference below.
  const layoutBu =
    activeBusinessUnits.find((bu) => bu._id === preferredBusinessUnitId) ??
    primaryBu;

  const homepageSections = useQuery(
    api.homepageSections.getVisible,
    layoutBu ? { businessUnitId: layoutBu._id } : "skip",
  ) as HomepageSection[] | undefined;

  const sectionsReady = layoutBu === undefined || homepageSections !== undefined;

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
      {/* 2. PROMOTIONAL BANNER STRIP — active promotions (horizontal)     */}
      {/* ================================================================ */}

      {!isLoading && <PromoBannerStrip />}

      {/* ================================================================ */}
      {/* 3. HAPPY HOUR — active announcement banner, when currently valid */}
      {/* ================================================================ */}

      {!isLoading && <HappyHourBanner />}

      {/* ================================================================ */}
      {/* 4. DELIVERY INFORMATION STRIP                                   */}
      {/* ================================================================ */}

      {!isLoading && <DeliveryInfoStrip />}

      {/* ================================================================ */}
      {/* 5. FLASH SALES — time-urgent active offers with countdown        */}
      {/* ================================================================ */}

      {!isLoading && <FlashSalesSection businessUnits={activeBusinessUnits} />}

      {/* ================================================================ */}
      {/* 6. BROWSE BY CATEGORY — Premium category grid                    */}
      {/* ================================================================ */}

      {!isLoading && <CategoriesSection businessUnits={activeBusinessUnits} isLoading={isLoading} />}

      {/* ================================================================ */}
      {/* 7. DYNAMIC HOMEPAGE SECTIONS — ordered via homepageSections      */}
      {/* ================================================================ */}

      {!isLoading && sectionsReady && (
        activeBusinessUnits.length === 0 ? (
          <section className="py-16">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <EmptyState
                title="Explore our services"
                description="Once business units are created, their products and offers will appear here."
                icon={Sparkles}
              />
            </div>
          </section>
        ) : (
          <HomepageSectionRenderer
            sections={homepageSections}
            businessUnits={activeBusinessUnits}
            preferredBusinessUnitId={preferredBusinessUnitId ?? undefined}
          />
        )
      )}

      {/* ================================================================ */}
      {/* 8. SEASONAL PICKS — time-aware themed product row                 */}
      {/* ================================================================ */}

      {!isLoading && <SeasonalSection businessUnits={activeBusinessUnits} />}

      {/* ================================================================ */}
      {/* 9. CONTINUE SHOPPING — cart-category related products            */}
      {/* ================================================================ */}

      {!isLoading && <ContinueShoppingSection businessUnits={activeBusinessUnits} />}

      {/* ================================================================ */}
      {/* 10. RECOMMENDED FOR YOU — deterministic personalized picks        */}
      {/* ================================================================ */}

      {!isLoading && <RecommendedForYouSection businessUnits={activeBusinessUnits} />}

      {/* ================================================================ */}
      {/* 11. RECENTLY VIEWED — localStorage, guest-friendly                */}
      {/* ================================================================ */}

      {!isLoading && <RecentlyViewedSection businessUnits={activeBusinessUnits} />}

      {/* ================================================================ */}
      {/* 12. TRENDING NOW — featured/order/view ranked row                 */}
      {/* ================================================================ */}

      {!isLoading && <TrendingNowSection businessUnits={activeBusinessUnits} />}

      {/* ================================================================ */}
      {/* 13. WHY CHOOSE MB CRUNCHY                                        */}
      {/* ================================================================ */}

      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <div className="mb-2 flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                Why Us
              </span>
            </div>
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
                  <div className="h-full rounded-2xl border border-border/40 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5 hover:border-accent/20">
                    <div
                      className={cn(
                        "mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3",
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
      {/* 14. FINAL CTA                                                    */}
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
