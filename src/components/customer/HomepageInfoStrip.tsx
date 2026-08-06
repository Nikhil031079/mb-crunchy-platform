import { memo, useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { Clock3, Megaphone, Truck, Salad, ShieldCheck, Star, ArrowRight } from "lucide-react";

import { api } from "@convex/_generated/api";

import { cn } from "@/lib/utils";
import { isContentActive } from "@/utils";

import type { Content } from "@/types";

// ============================================================================
// HomepageInfoStrip — single compact strip that replaces the three previously
// stacked bars (PromoBannerStrip + HappyHourBanner + DeliveryInfoStrip).
// Renders the active announcement, active promotion chips, and the static
// trust points together in one section.
// ============================================================================

interface InfoItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  color: string;
}

const INFO_ITEMS: InfoItem[] = [
  {
    icon: Truck,
    title: "Fast Delivery",
    subtitle: "At your doorstep, in minutes",
    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400",
  },
  {
    icon: Salad,
    title: "Fresh Everyday",
    subtitle: "Prepared fresh, daily",
    color: "text-green-600 bg-green-50 dark:bg-green-950/50 dark:text-green-400",
  },
  {
    icon: ShieldCheck,
    title: "Secure Payments",
    subtitle: "UPI, cards & more",
    color: "text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400",
  },
  {
    icon: Star,
    title: "Premium Quality",
    subtitle: "Quality you can trust",
    color: "text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400",
  },
];

export const HomepageInfoStrip = memo(function HomepageInfoStrip() {
  const promoBanners = useQuery(api.content.getByType, {
    contentType: "promotion",
  }) as Content[] | undefined;

  const announcements = useQuery(api.content.getByType, {
    contentType: "announcement",
  }) as Content[] | undefined;

  const activePromos = useMemo(
    () =>
      (promoBanners ?? [])
        .filter((b) => b.status === "active" && isContentActive(b))
        .slice(0, 4),
    [promoBanners]
  );

  const activeAnnouncement = useMemo(() => {
    if (!announcements) return undefined;
    return announcements
      .filter((a) => a.status === "active" && isContentActive(a))
      .sort((a, b) => a.displayOrder - b.displayOrder)[0];
  }, [announcements]);

  const hasDynamic = activeAnnouncement || activePromos.length > 0;

  return (
    <section className="border-b border-border/40 bg-background">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        {activeAnnouncement && <AnnouncementBar banner={activeAnnouncement} />}

        {activePromos.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent lg:flex">
              <Megaphone className="h-4 w-4" />
            </div>
            <div className="flex flex-1 gap-2 overflow-x-auto pb-1 scrollbar-none snap-x snap-mandatory">
              {activePromos.map((banner) => (
                <PromoChip key={banner._id} banner={banner} />
              ))}
            </div>
          </div>
        )}

        <div className={cn("grid grid-cols-2 gap-2 lg:grid-cols-4", hasDynamic && "mt-3")}>
          {INFO_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="group flex items-center gap-2.5 rounded-xl border border-border/40 bg-card px-3 py-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/20 hover:shadow-sm"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110",
                    item.color
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground leading-tight">
                    {item.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
});

// ============================================================================
// AnnouncementBar — compact happy-hour style gradient bar
// ============================================================================

function AnnouncementBar({ banner }: { banner: Content }) {
  const inner = (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-4 py-2.5 text-white">
      <Clock3 className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{banner.title}</p>
      {banner.subtitle && (
        <span className="hidden max-w-[40%] truncate text-xs text-white/85 sm:inline">
          {banner.subtitle}
        </span>
      )}
      {banner.buttonText && <ArrowRight className="h-4 w-4 shrink-0" />}
    </div>
  );

  if (banner.buttonLink) {
    return (
      <Link to={banner.buttonLink} className="mb-3 flex rounded-xl transition-opacity hover:opacity-95">
        {inner}
      </Link>
    );
  }

  return <div className="mb-3">{inner}</div>;
}

// ============================================================================
// PromoChip — compact promotional card
// ============================================================================

function PromoChip({ banner }: { banner: Content }) {
  const image = banner.coverImage || banner.images?.[0];
  return (
    <div className="flex min-w-[220px] max-w-[300px] snap-start items-center gap-2.5 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2">
      {image && (
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-secondary">
          <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight">{banner.title}</p>
        {(banner.subtitle || banner.body) && (
          <p className="truncate text-xs text-muted-foreground leading-tight">
            {banner.subtitle || banner.body}
          </p>
        )}
      </div>
    </div>
  );
}
