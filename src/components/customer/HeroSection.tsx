import { useState, useEffect, useCallback, memo } from "react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles, Utensils, ShoppingBag, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SITE_NAME, ROUTES } from "@/constants";

import type { Offer, BusinessUnit } from "@/types";

// ============================================================================
// Types
// ============================================================================

interface HeroAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "outline" | "secondary";
}

interface HeroBanner {
  _id: string;
  title: string;
  subtitle?: string;
  description?: string;
  backgroundImage?: string;
  overlayColor?: string;
  actions?: HeroAction[];
  badge?: string;
}

interface HeroSectionProps {
  title?: string;
  subtitle?: string;
  description?: string;
  backgroundImage?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  actions?: HeroAction[];
  badge?: string;
  alignment?: "left" | "center" | "right";
  size?: "sm" | "default" | "lg";
  themeColor?: string;
  /** Rotating banners — when provided, hero becomes a carousel */
  banners?: HeroBanner[];
  /** Business units for CTA buttons when no banners */
  businessUnits?: BusinessUnit[];
}

// ============================================================================
// Auto-rotating interval (ms)
// ============================================================================

const ROTATION_INTERVAL = 5000;

// ============================================================================
// Default Premium Hero Content
// ============================================================================

function DefaultHeroContent({
  title,
  subtitle,
  description,
  actions,
  badge,
  alignment,
  businessUnits,
}: Pick<HeroSectionProps, "title" | "subtitle" | "description" | "actions" | "badge" | "alignment" | "businessUnits">) {
  return (
    <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
      {/* Badge */}
      {badge && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Badge
            variant="secondary"
            className="mb-4 gap-1.5 bg-white/10 text-white/90 backdrop-blur-sm border-white/10 px-3 py-1 text-xs"
          >
            <Sparkles className="h-3 w-3" />
            {badge}
          </Badge>
        </motion.div>
      )}

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className={cn(
          "text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl",
          "drop-shadow-lg"
        )}
      >
        {title ?? `Welcome to ${SITE_NAME}`}
      </motion.h1>

      {/* Subtitle */}
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-4 text-base text-white/80 sm:text-lg drop-shadow-sm"
        >
          {subtitle}
        </motion.p>
      )}

      {/* Description */}
      {description && (
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mx-auto mt-3 max-w-xl text-sm text-white/60"
        >
          {description}
        </motion.p>
      )}

      {/* CTA Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-8 flex flex-wrap items-center justify-center gap-3"
      >
        {actions?.map((action) =>
          action.href ? (
            <Link key={action.label} to={action.href}>
              <Button
                variant={action.variant === "outline" ? "outline" : "default"}
                size="lg"
                className={cn(
                  "rounded-full px-6 text-sm font-semibold shadow-lg",
                  action.variant === "outline"
                    ? "border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
                    : "bg-white text-foreground hover:bg-white/90"
                )}
              >
                {action.label}
              </Button>
            </Link>
          ) : (
            <Button
              key={action.label}
              variant={action.variant === "outline" ? "outline" : "default"}
              size="lg"
              onClick={action.onClick}
              className={cn(
                "rounded-full px-6 text-sm font-semibold shadow-lg",
                action.variant === "outline"
                  ? "border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
                  : "bg-white text-foreground hover:bg-white/90"
              )}
            >
              {action.label}
            </Button>
          )
        )}

        {/* Default BU buttons when no explicit actions */}
        {!actions && businessUnits && businessUnits.length > 0 && (
          <>
            {businessUnits.map((bu) => (
              <Link
                key={bu._id}
                to={`/${bu.slug}`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-foreground shadow-lg transition-all hover:bg-white/90 hover:shadow-xl"
              >
                {bu.logo ? (
                  <img src={bu.logo} alt="" className="h-5 w-5 rounded object-cover" />
                ) : (
                  <div
                    className="h-5 w-5 rounded"
                    style={{ backgroundColor: bu.themeColor || "#000" }}
                  />
                )}
                Order from {bu.name}
              </Link>
            ))}
          </>
        )}
      </motion.div>
    </div>
  );
}

// ============================================================================
// Banner Slide
// ============================================================================

function BannerSlide({ banner }: { banner: HeroBanner }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div className="relative h-full w-full">
      {/* Background Image */}
      {banner.backgroundImage && !imageError ? (
        <>
          {!imageLoaded && <div className="absolute inset-0 animate-pulse bg-secondary" />}
          <img
            src={banner.backgroundImage}
            alt={banner.title}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-700",
              imageLoaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        </>
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600" />
      )}

      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: banner.overlayColor
            ? `${banner.overlayColor}`
            : "linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex h-full items-center">
        <div className="mx-auto max-w-4xl px-4 text-center w-full">
          {banner.badge && (
            <Badge
              variant="secondary"
              className="mb-4 gap-1.5 bg-white/10 text-white/90 backdrop-blur-sm border-white/10 px-3 py-1 text-xs"
            >
              {banner.badge}
            </Badge>
          )}

          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl drop-shadow-lg">
            {banner.title}
          </h2>

          {banner.subtitle && (
            <p className="mt-3 text-base text-white/80 sm:text-lg drop-shadow-sm">
              {banner.subtitle}
            </p>
          )}

          {banner.description && (
            <p className="mx-auto mt-2 max-w-xl text-sm text-white/60">
              {banner.description}
            </p>
          )}

          {banner.actions && banner.actions.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {banner.actions.map((action) =>
                action.href ? (
                  <Link key={action.label} to={action.href}>
                    <Button
                      variant={action.variant === "outline" ? "outline" : "default"}
                      size="lg"
                      className={cn(
                        "rounded-full px-6 text-sm font-semibold shadow-lg",
                        action.variant === "outline"
                          ? "border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
                          : "bg-white text-foreground hover:bg-white/90"
                      )}
                    >
                      {action.label}
                    </Button>
                  </Link>
                ) : (
                  <Button
                    key={action.label}
                    variant={action.variant === "outline" ? "outline" : "default"}
                    size="lg"
                    onClick={action.onClick}
                    className={cn(
                      "rounded-full px-6 text-sm font-semibold shadow-lg",
                      action.variant === "outline"
                        ? "border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
                        : "bg-white text-foreground hover:bg-white/90"
                    )}
                  >
                    {action.label}
                  </Button>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HeroSection — Main Component
// ============================================================================

export const HeroSection = memo(function HeroSection({
  title,
  subtitle,
  description,
  backgroundImage,
  overlayColor,
  actions,
  badge,
  alignment = "center",
  size = "default",
  businessUnits,
  banners,
}: HeroSectionProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const hasBanners = banners && banners.length > 0;

  // Auto-rotate banners
  useEffect(() => {
    if (!hasBanners || isPaused) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % banners.length);
    }, ROTATION_INTERVAL);
    return () => clearInterval(timer);
  }, [hasBanners, isPaused, banners?.length]);

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(index);
  }, []);

  const prevSlide = useCallback(() => {
    if (!banners) return;
    setCurrentSlide((prev) => (prev - 1 + banners.length) % banners.length);
  }, [banners]);

  const nextSlide = useCallback(() => {
    if (!banners) return;
    setCurrentSlide((prev) => (prev + 1) % banners.length);
  }, [banners]);

  const heightClass = size === "lg" ? "min-h-[300px] sm:min-h-[380px] md:min-h-[480px] lg:min-h-[520px]" : size === "sm" ? "min-h-[280px] sm:min-h-[320px]" : "min-h-[350px] sm:min-h-[400px]";

  return (
    <section
      className={cn(
        "relative w-full overflow-hidden",
        heightClass,
        !hasBanners && "bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600"
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Rotating Banners Mode */}
      {hasBanners ? (
        <>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0"
            >
              <BannerSlide banner={banners[currentSlide]} />
            </motion.div>
          </AnimatePresence>

          {/* Navigation Arrows */}
          {banners.length > 1 && (
            <>
              <button
                onClick={prevSlide}
                className="absolute left-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-all hover:bg-black/50"
                aria-label="Previous banner"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={nextSlide}
                className="absolute right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-all hover:bg-black/50"
                aria-label="Next banner"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {/* Dots */}
          {banners.length > 1 && (
            <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2">
              {banners.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToSlide(i)}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    i === currentSlide
                      ? "w-6 bg-white"
                      : "w-2 bg-white/40 hover:bg-white/60"
                  )}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        /* Default Hero — decorative background */
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600" />
          {/* Decorative circles */}
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-white/5" />
          <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-white/5" />
          <div className="absolute right-1/4 top-1/3 h-40 w-40 rounded-full bg-white/3" />
        </div>
      )}

      {/* Default Content (when no banners) */}
      {!hasBanners && (
        <DefaultHeroContent
          title={title}
          subtitle={subtitle}
          description={description}
          actions={actions}
          badge={badge}
          alignment={alignment}
          businessUnits={businessUnits}
        />
      )}
    </section>
  );
});

// ============================================================================
// HeroSectionSkeleton
// ============================================================================

export function HeroSectionSkeleton() {
  return (
    <div className="flex min-h-[420px] w-full animate-pulse items-center bg-secondary/50">
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
  );
}
