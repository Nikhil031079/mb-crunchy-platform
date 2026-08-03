import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { Megaphone, ArrowRight } from "lucide-react";

import { api } from "@convex/_generated/api";

import { cn } from "@/lib/utils";
import { isContentActive, getContentMarketingSettings } from "@/utils";

import type { Content } from "@/types";

// ============================================================================
// PromoBannerStrip — horizontal strip of active promotional banners.
// Sources `content` records with contentType "promotion" (active + date-valid).
// Scrolls horizontally on mobile and lays out responsively on larger screens.
// ============================================================================

interface PromoBannerStripProps {
  className?: string;
}

export function PromoBannerStrip({ className }: PromoBannerStripProps) {
  const banners = useQuery(api.content.getByType, {
    contentType: "promotion",
  }) as Content[] | undefined;

  const activeBanners = useMemo(() => {
    if (!banners) return undefined;
    return banners
      .filter((b) => b.status === "active" && isContentActive(b))
      .slice(0, 4);
  }, [banners]);

  if (activeBanners === undefined) {
    return (
      <section className={cn("border-b border-border/40 bg-secondary/20", className)}>
        <div className="mx-auto flex max-w-7xl gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="h-16 w-full max-w-[320px] animate-pulse rounded-xl bg-secondary" />
          <div className="hidden h-16 w-full max-w-[320px] animate-pulse rounded-xl bg-secondary sm:block" />
        </div>
      </section>
    );
  }

  if (activeBanners.length === 0) return null;

  return (
    <section className={cn("border-b border-border/40 bg-secondary/20", className)}>
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Megaphone className="h-4.5 w-4.5" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Promotions
            </span>
          </div>

          <div className="flex flex-1 gap-3 overflow-x-auto pb-1 scrollbar-none snap-x snap-mandatory">
            {activeBanners.map((banner) => (
              <PromoStripItem key={banner._id} banner={banner} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// PromoStripItem — single promotional card
// ============================================================================

function PromoStripItem({ banner }: { banner: Content }) {
  const image = banner.coverImage || banner.images?.[0];
  const href = banner.buttonLink;
  const settings = getContentMarketingSettings(banner);
  const textColor = settings.textColor;

  const inner = (
    <div
      className={cn(
        "group flex min-w-[248px] max-w-[320px] snap-start items-center gap-3 rounded-xl border border-border/60 bg-background p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-sm",
        href && "cursor-pointer"
      )}
      style={settings.backgroundColor ? { backgroundColor: settings.backgroundColor } : undefined}
    >
      {settings.icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/60">
          <img src={settings.icon} alt="" className="h-full w-full object-contain" loading="lazy" />
        </div>
      )}
      {!settings.icon && image && (
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" style={textColor ? { color: textColor } : undefined}>{banner.title}</p>
        {(banner.subtitle || banner.body) && (
          <p className="truncate text-xs text-muted-foreground" style={textColor ? { color: textColor, opacity: 0.8 } : undefined}>
            {banner.subtitle || banner.body}
          </p>
        )}
      </div>
      {banner.buttonText && (
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </div>
  );

  if (href) {
    return <Link to={href} className="block">{inner}</Link>;
  }

  return inner;
}
