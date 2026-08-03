import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { Clock3, ArrowRight } from "lucide-react";

import { api } from "@convex/_generated/api";

import { cn } from "@/lib/utils";
import { isContentActive } from "@/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { Content } from "@/types";

// ============================================================================
// HappyHourBanner — active "Happy Hour" style announcement, shown only while
// currently valid.
//
// NOTE: a dedicated `happyHours` collection does not exist yet, so this is
// derived from `content` records with contentType "announcement" that are
// active and currently within their configured date window.
// ============================================================================

interface HappyHourBannerProps {
  className?: string;
}

export function HappyHourBanner({ className }: HappyHourBannerProps) {
  const announcements = useQuery(api.content.getByType, {
    contentType: "announcement",
  }) as Content[] | undefined;

  const activeAnnouncement = useMemo(() => {
    if (!announcements) return undefined;
    return announcements
      .filter((a) => a.status === "active" && isContentActive(a))
      .sort((a, b) => a.displayOrder - b.displayOrder)[0];
  }, [announcements]);

  if (activeAnnouncement === undefined) return null;
  if (!activeAnnouncement) return null;

  const banner = activeAnnouncement;
  const image = banner.coverImage || banner.images?.[0];
  const href = banner.buttonLink;

  return (
    <section className={cn("border-b border-border/40", className)}>
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <div className="relative flex flex-col gap-4 overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
          {/* Decorative circles */}
          <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute -bottom-14 -left-8 h-40 w-40 rounded-full bg-white/10" />

          <div className="relative z-10 flex items-start gap-4">
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm sm:flex">
              <Clock3 className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="default"
                  className="gap-1 bg-white/20 text-white border-transparent text-[10px] font-bold"
                >
                  <Clock3 className="h-3 w-3" />
                  Happy Hour
                </Badge>
                {banner.title && (
                  <h2 className="text-lg font-bold leading-snug sm:text-xl">
                    {banner.title}
                  </h2>
                )}
              </div>
              {(banner.subtitle || banner.body) && (
                <p className="mt-1 max-w-xl text-sm text-white/85">
                  {banner.subtitle || banner.body}
                </p>
              )}
            </div>
            {image && (
              <div className="hidden h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white/15 md:block">
                <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
              </div>
            )}
          </div>

          {banner.buttonText && (
            <div className="relative z-10 shrink-0">
              {href ? (
                <Link to={href}>
                  <Button
                    size="sm"
                    className="gap-1.5 rounded-lg bg-white text-foreground hover:bg-white/90"
                  >
                    {banner.buttonText}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5 rounded-lg bg-white text-foreground hover:bg-white/90"
                >
                  {banner.buttonText}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
