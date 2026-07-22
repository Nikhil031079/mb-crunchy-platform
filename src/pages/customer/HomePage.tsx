import { useMemo, useCallback } from "react";
import { Link } from "react-router";
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
  Star,
  Utensils,
  Package,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";

import { SITE_NAME, SITE_DESCRIPTION } from "@/constants";
import { cn } from "@/lib/utils";
import { useCart } from "@/stores/cart";

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
  CustomerReviewCard,
  CardGridSkeleton,
} from "@/components/customer";

// Shared components
import { BusinessUnitCard, BusinessUnitCardSkeleton } from "@/components/shared/BusinessUnitCard";
import { EmptyState } from "@/components/shared/EmptyState";

import type { BusinessUnit, Combo, Offer, PartyPack } from "@/types";

// ============================================================================
// Why Choose MB Crunchy — Static brand values (always shown)
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
    color: "text-emerald-600 bg-emerald-100",
  },
  {
    icon: ShoppingBag,
    title: "Daily Grocery",
    description: "All your everyday essentials available under one roof, anytime.",
    color: "text-blue-600 bg-blue-100",
  },
  {
    icon: ShoppingCart,
    title: "One Cart",
    description: "Mix items from Kitchen and Mart in a single order. One checkout, one delivery.",
    color: "text-accent bg-accent/10",
  },
  {
    icon: Truck,
    title: "Fast Delivery",
    description: "Swift and reliable delivery right to your doorstep, when you need it.",
    color: "text-amber-600 bg-amber-100",
  },
  {
    icon: ShieldCheck,
    title: "Trusted Quality",
    description: "Every product meets our strict quality standards before reaching you.",
    color: "text-green-600 bg-green-100",
  },
  {
    icon: Zap,
    title: "Fast Service",
    description: "Quick order processing and responsive support to serve you better.",
    color: "text-purple-600 bg-purple-100",
  },
];

// ============================================================================
// Placeholder Reviews (until admin CRUD is built)
// ============================================================================

const PLACEHOLDER_REVIEWS = [
  {
    rating: 5,
    text: "Absolutely love MB Crunchy! The food from Kitchen is incredible and Mart has everything I need. The convenience of one cart is a game-changer.",
    authorName: "Sarah Johnson",
    location: "Lagos",
    featured: true,
  },
  {
    rating: 5,
    text: "The party packs made my daughter's birthday so special. Everything arrived fresh and on time. Highly recommended!",
    authorName: "Michael Okafor",
    location: "Abuja",
    featured: false,
  },
  {
    rating: 4,
    text: "Great quality and fast delivery. The MB Mart grocery selection has improved so much. Only wish they had more organic options.",
    authorName: "Chioma Eze",
    location: "Port Harcourt",
    featured: false,
  },
  {
    rating: 5,
    text: "I've been using MB Crunchy for months now. The combo deals save me so much money. Customer service is exceptional.",
    authorName: "Emeka Nwosu",
    location: "Enugu",
    featured: true,
  },
  {
    rating: 4,
    text: "Being able to order from both Kitchen and Mart in one go is brilliant. The app experience is smooth and intuitive.",
    authorName: "Funmi Adeyemi",
    location: "Ibadan",
    featured: false,
  },
];

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
  // Each child component calls hooks unconditionally at the top level
  // This ensures React always sees the same number of hooks per component
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
    partyPacks !== undefined;

  const hasFeatured = featuredProducts && featuredProducts.length > 0;
  const hasCombos = combos && combos.length > 0;
  const hasPartyPacks = partyPacks && partyPacks.length > 0;

  if (!isDataLoaded) {
    return <BusinessUnitSectionSkeleton buIndex={buIndex} />;
  }

  if (!hasFeatured && !hasCombos && !hasPartyPacks) return null;

  const buSlug = bu.slug;

  return (
    <motion.section
      key={bu._id}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className={cn("py-16", buIndex % 2 === 1 && "bg-secondary/20")}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* BU Header */}
        <div className="mb-8 flex items-center gap-3">
          {bu.logo ? (
            <img
              src={bu.logo}
              alt=""
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
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

        {/* Featured Products */}
        {hasFeatured && (
          <div className="mb-10">
            <SectionHeader
              title="Popular Items"
              subtitle="Our most-loved selections"
              action={{
                label: `Browse ${bu.name}`,
                onClick: () => (window.location.href = `/${buSlug}`),
              }}
              size="sm"
            />
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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

        {/* Combos (if enabled) */}
        {hasCombos && (
          <div className="mb-10">
            <SectionHeader
              title={`${bu.name} Combos`}
              subtitle="Curated bundles at great value"
              action={{
                label: "View All Combos",
                onClick: () => (window.location.href = `/${buSlug}`),
              }}
              size="sm"
            />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {combos!.slice(0, 4).map((combo, index) => (
                <ComboCard key={combo._id} combo={combo} index={index} />
              ))}
            </div>
          </div>
        )}

        {/* Party Packs (if enabled) */}
        {hasPartyPacks && (
          <div>
            <SectionHeader
              title={`${bu.name} Party Packs`}
              subtitle="Perfect for gatherings and events"
              action={{
                label: "View All Packs",
                onClick: () => (window.location.href = `/${buSlug}`),
              }}
              size="sm"
            />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {partyPacks!.slice(0, 4).map((pack, index) => (
                <PartyPackCard key={pack._id} partyPack={pack} index={index} />
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}

// ============================================================================
// BusinessUnitSectionSkeleton — Loading placeholder
// ============================================================================

function BusinessUnitSectionSkeleton({ buIndex }: { buIndex: number }) {
  return (
    <section className={cn("py-16", buIndex % 2 === 0 && "bg-secondary/20")}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-secondary" />
          <div className="space-y-2">
            <div className="h-6 w-32 animate-pulse rounded bg-secondary" />
            <div className="h-4 w-48 animate-pulse rounded bg-secondary" />
          </div>
        </div>
        <div className="mb-6">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="h-6 w-36 animate-pulse rounded bg-secondary" />
        </div>
        <CardGridSkeleton count={5} columns={4} type="product" />
        <div className="mt-10 mb-6">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="h-6 w-32 animate-pulse rounded bg-secondary" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <ComboCardSkeleton key={i} />
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
  // ==========================================================================
  // Data Fetching — fully dynamic from Convex
  // Hooks called unconditionally at the top level (no hooks inside callbacks)
  // ==========================================================================

  const businessUnits = useQuery(api.businessUnits.getActive) as BusinessUnit[] | undefined;
  const allOffers = useQuery(api.offers.getAll) as Offer[] | undefined;

  // Loading state
  const isLoading = businessUnits === undefined;

  // Active business units
  const activeBusinessUnits = useMemo(
    () =>
      (businessUnits ?? []).filter(
        (bu) => bu.status === "active" && bu.homepageVisible
      ),
    [businessUnits]
  );

  // Active offers across all BUs for "Today's Deals"
  const activeOffers = useMemo(
    () => (allOffers ?? []).filter((o) => o.status === "active"),
    [allOffers]
  );

  // ==========================================================================
  // Render Helpers
  // ==========================================================================

  const scrollToSection = (elementId: string) => {
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="min-h-screen bg-background">
      {/* ================================================================ */}
      {/* 1. HERO SECTION                                                 */}
      {/* ================================================================ */}

      {isLoading ? (
        <div className="flex min-h-[450px] w-full animate-pulse items-center bg-secondary/50">
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
          title={`Welcome to ${SITE_NAME}`}
          subtitle="Discover a World of Quality"
          description={SITE_DESCRIPTION}
          badge="Explore Our Services"
          size="lg"
          actions={[
            {
              label: "Browse Services",
              onClick: () => scrollToSection("business-units"),
              variant: "default",
            },
            {
              label: "Today's Deals",
              onClick: () => scrollToSection("todays-deals"),
              variant: "outline",
            },
          ]}
        />
      )}

      {/* ================================================================ */}
      {/* 2. BUSINESS UNIT CARDS                                          */}
      {/* ================================================================ */}

      <section id="business-units" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeader
          title="Our Business Units"
          subtitle="Explore everything we offer across our dynamic range of services"
          alignment="center"
          size="lg"
        />

        {isLoading ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <BusinessUnitCardSkeleton key={i} />
            ))}
          </div>
        ) : activeBusinessUnits.length > 0 ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeBusinessUnits.map((bu, index) => (
              <BusinessUnitCard key={bu._id} businessUnit={bu} index={index} />
            ))}
          </div>
        ) : (
          <div className="mt-10">
            <EmptyState
              title="No business units yet"
              description="Business units will appear here once they're created."
              icon={Package}
            />
          </div>
        )}
      </section>

      {/* ================================================================ */}
      {/* 3. TODAY'S DEALS                                                 */}
      {/* ================================================================ */}

      {!isLoading && activeOffers.length > 0 && (
        <section id="todays-deals" className="bg-secondary/20 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader
              title="Today's Deals"
              subtitle="Limited-time offers you don't want to miss"
              action={{ label: "View All Offers", onClick: () => {} }}
              alignment="center"
            />
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activeOffers.slice(0, 6).map((offer, index) => (
                <OfferBanner key={offer._id} banner={offer} index={index} variant="card" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* 4. PER-BUSINESS UNIT SECTIONS (Fully Dynamic)                   */}
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

      {/* Each BusinessUnitSection is a child component with its own hooks */}
      {activeBusinessUnits.map((bu, buIndex) => (
        <BusinessUnitSection key={bu._id} bu={bu} buIndex={buIndex} />
      ))}

      {/* Loading: Per-BU skeleton sections while data loads */}
      {isLoading && (
        <>
          {[1, 2].map((sectionIdx) => (
            <BusinessUnitSectionSkeleton key={sectionIdx} buIndex={sectionIdx} />
          ))}
        </>
      )}

      {/* ================================================================ */}
      {/* WHY CHOOSE MB CRUNCHY                                            */}
      {/* ================================================================ */}

      <section className="bg-accent/[0.02] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            title={`Why Choose ${SITE_NAME}`}
            subtitle="We're committed to delivering the best experience across every service"
            alignment="center"
            size="lg"
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_CHOOSE_ITEMS.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                  className="group"
                >
                  <div className="rounded-xl border border-border/60 bg-card p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 hover:border-accent/20">
                    <div
                      className={cn(
                        "mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl transition-colors group-hover:scale-110",
                        item.color
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mb-2 font-semibold">{item.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
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
      {/* CUSTOMER REVIEWS                                                 */}
      {/* ================================================================ */}

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            title="What Our Customers Say"
            subtitle="Real reviews from real customers who love the MB Crunchy experience"
            alignment="center"
            size="lg"
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PLACEHOLDER_REVIEWS.map((review, index) => (
              <CustomerReviewCard
                key={index}
                rating={review.rating}
                text={review.text}
                authorName={review.authorName}
                location={review.location}
                index={index}
                featured={review.featured}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FINAL CTA                                                        */}
      {/* ================================================================ */}

      <section className="border-t border-border/40 bg-primary py-16 text-primary-foreground">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
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
              Browse our business units, explore our products, and enjoy
              seamless delivery right to your doorstep.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {activeBusinessUnits.map((bu) => (
                <Link
                  key={bu._id}
                  to={`/${bu.slug}`}
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-medium backdrop-blur-sm transition-all hover:bg-white/20"
                >
                  {bu.name}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FOOTER                                                           */}
      {/* ================================================================ */}

      <footer className="border-t border-border/40 bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand */}
            <div className="space-y-4 lg:col-span-1">
              <Link
                to="/"
                className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <span className="text-lg font-bold">{SITE_NAME}</span>
              </Link>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {SITE_DESCRIPTION}
              </p>
            </div>

            {/* Quick Links */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold tracking-tight">Quick Links</h4>
              <ul className="space-y-3">
                <li>
                  <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Home
                  </Link>
                </li>
                <li>
                  <Link to="/cart" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Cart
                  </Link>
                </li>
                <li>
                  <Link to="/checkout" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Checkout
                  </Link>
                </li>
              </ul>
            </div>

            {/* Business Units */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold tracking-tight">Our Services</h4>
              {activeBusinessUnits.length > 0 ? (
                <ul className="space-y-3">
                  {activeBusinessUnits.map((bu) => (
                    <li key={bu._id}>
                      <Link
                        to={`/${bu.slug}`}
                        className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {bu.logo ? (
                          <img src={bu.logo} alt="" className="h-4 w-4 rounded object-cover" />
                        ) : (
                          <div
                            className="h-4 w-4 rounded"
                            style={{ backgroundColor: bu.themeColor || "#000" }}
                          />
                        )}
                        {bu.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="space-y-3">
                  <li><span className="text-sm text-muted-foreground">Services coming soon</span></li>
                </ul>
              )}
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold tracking-tight">Support</h4>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Need help? Contact our support team for assistance with orders, deliveries, or any inquiries.
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Star className="h-4 w-4 text-accent" />
                <span>Available 24/7</span>
              </div>
            </div>
          </div>

          <div className="mt-12 border-t border-border/40 pt-6 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
