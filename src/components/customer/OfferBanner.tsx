import { motion } from "framer-motion";
import { Tag, ArrowRight, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";

import type { Offer, Content } from "@/types";

type BannerData = Partial<Offer> & Partial<Content>;

interface OfferBannerProps {
  banner: BannerData;
  index?: number;
  onAction?: (banner: BannerData) => void;
  className?: string;
  variant?: "default" | "compact" | "card";
  showCountdown?: boolean;
  endsAt?: number;
}

export function OfferBanner({
  banner,
  index = 0,
  onAction,
  className,
  variant = "default",
  showCountdown = false,
  endsAt,
}: OfferBannerProps) {
  const title = banner.title;
  const description = banner.description || banner.subtitle || banner.body;
  const imageSrc = banner.coverImage || banner.banner || banner.images?.[0] || banner.thumbnail;
  const buttonText = banner.buttonText || "Shop Now";
  const discountType = "discountType" in banner ? banner.discountType : undefined;
  const discountValue = "discountValue" in banner ? banner.discountValue : undefined;

  const hasDiscount = discountType && discountValue !== undefined && discountValue > 0;
  const discountLabel = hasDiscount
    ? discountType === "percentage"
      ? `${discountValue}% OFF`
      : `${formatCurrency(discountValue)} OFF`
    : null;

  const handleAction = (e: React.MouseEvent) => {
    e.preventDefault();
    onAction?.(banner);
  };

  if (variant === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: index * 0.03 }}
      >
        <div
          className={cn(
            "group flex items-center gap-3 rounded-xl border border-accent/15 bg-accent/[0.03] p-3 transition-all hover:border-accent/25 hover:bg-accent/[0.06]",
            className
          )}
          role="button"
          tabIndex={0}
          onClick={handleAction}
          onKeyDown={(e) => e.key === "Enter" && handleAction(e as any)}
        >
          {imageSrc && (
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
              <img
                src={imageSrc}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{title}</p>
            {description && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {description}
              </p>
            )}
          </div>
          {discountLabel && (
            <Badge variant="default" className="shrink-0 bg-accent text-accent-foreground text-[10px] font-bold">
              {discountLabel}
            </Badge>
          )}
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </motion.div>
    );
  }

  if (variant === "card") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: index * 0.04 }}
      >
        <div
          className={cn(
            "group relative overflow-hidden rounded-xl border border-accent/15 bg-gradient-to-br from-accent/[0.03] to-accent/[0.07] p-5 transition-all hover:shadow-md hover:border-accent/25 cursor-pointer",
            className
          )}
          onClick={handleAction}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleAction(e as any)}
        >
          {/* Decorative */}
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/5" />

          <div className="relative z-10">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                {discountLabel && (
                  <Badge variant="default" className="bg-accent text-accent-foreground text-xs font-bold">
                    <Tag className="mr-1 h-3 w-3" />
                    {discountLabel}
                  </Badge>
                )}
                <h3 className="font-semibold">{title}</h3>
                {description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {description}
                  </p>
                )}
              </div>
              {imageSrc && (
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg">
                  <img
                    src={imageSrc}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button variant="default" size="sm" className="gap-1.5 rounded-lg text-xs">
                {buttonText}
                <ArrowRight className="h-3 w-3" />
              </Button>
              {showCountdown && endsAt && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Limited time
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Default: Full-width banner
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl",
          imageSrc ? "min-h-[200px]" : "min-h-[140px]",
          className
        )}
      >
        {/* Background */}
        {imageSrc ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${imageSrc})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-accent/10 to-accent/5" />
        )}

        {/* Content */}
        <div className="relative z-10 flex h-full flex-col justify-center px-6 py-8 sm:px-10">
          {discountLabel && (
            <Badge
              variant="default"
              className="mb-3 w-fit bg-accent text-accent-foreground text-xs font-bold"
            >
              <Tag className="mr-1 h-3 w-3" />
              {discountLabel}
            </Badge>
          )}

          <h3
            className={cn(
              "text-xl font-bold sm:text-2xl max-w-lg",
              imageSrc && "text-white"
            )}
          >
            {title}
          </h3>

          {description && (
            <p
              className={cn(
                "mt-1.5 text-sm max-w-md",
                imageSrc ? "text-white/80" : "text-muted-foreground"
              )}
            >
              {description}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <Button
              variant={imageSrc ? "secondary" : "default"}
              size="sm"
              onClick={handleAction}
              className="gap-1.5 rounded-lg text-xs"
            >
              {buttonText}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            {showCountdown && endsAt && (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs",
                  imageSrc ? "text-white/70" : "text-muted-foreground"
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                Limited time offer
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * OfferBannerSkeleton — loading placeholder
 */
export function OfferBannerSkeleton() {
  return (
    <div className="min-h-[160px] animate-pulse rounded-xl bg-secondary" />
  );
}
