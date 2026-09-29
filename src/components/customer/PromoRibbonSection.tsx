import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Flame, ArrowRight } from "lucide-react";

import { api } from "@convex/_generated/api";
import { isContentActive } from "@/utils";
import { Button } from "@/components/ui/button";
import { CountdownTimer } from "@/components/customer/CountdownTimer";

import type { Content, Offer } from "@/types";

// ============================================================================
// PromoRibbonSection — Stitch-style dark promo ribbon.
//
// VISUAL recomposition of existing homepage promotion data:
// - announcement (contentType "announcement") and promo banners
//   (contentType "promotion") use the SAME queries HomepageInfoStrip
//   already fires (deduped — zero new backend surface for these).
// - live flash-sale countdown + coupon code reuse the existing offers
//   query family and the existing CountdownTimer component.
// - NO invented countdown, NO invented coupon code, NO copy interaction
//   (no copy mechanism exists), NO new timers or business rules.
// - CTA renders only from the announcement's real buttonLink.
// ============================================================================

function discountLabel(offer: Offer): string {
  return offer.discountType === "percentage"
    ? `${offer.discountValue}% OFF`
    : `\u20B9${offer.discountValue} OFF`;
}

export function PromoRibbonSection() {
  const promoBanners = useQuery(api.content.getByType, {
    contentType: "promotion",
  }) as Content[] | undefined;

  const announcements = useQuery(api.content.getByType, {
    contentType: "announcement",
  }) as Content[] | undefined;

  const offers = useQuery(
    api.offers.getAllActiveAcrossBusinessUnits,
  ) as Offer[] | undefined;

  const activePromos = useMemo(
    () =>
      (promoBanners ?? [])
        .filter((b) => b.status === "active" && isContentActive(b))
        .slice(0, 4),
    [promoBanners],
  );

  const activeAnnouncement = useMemo(() => {
    if (!announcements) return undefined;
    return announcements
      .filter((a) => a.status === "active" && isContentActive(a))
      .sort((a, b) => a.displayOrder - b.displayOrder)[0];
  }, [announcements]);

  // Live flash sale across all BUs — same status logic as FlashSalesSection.
  const liveFlash = useMemo(() => {
    const now = Date.now();
    return (offers ?? [])
      .filter(
        (o) =>
          o.status === "active" &&
          (o.settings as { isFlashSale?: boolean } | undefined)?.isFlashSale === true &&
          now >= o.startsAt &&
          now <= o.endsAt,
      )
      .sort(
        (a, b) =>
          ((b.settings as { flashSalePriority?: number } | undefined)?.flashSalePriority ?? 0) -
          ((a.settings as { flashSalePriority?: number } | undefined)?.flashSalePriority ?? 0),
      )[0];
  }, [offers]);

  if (!activeAnnouncement && activePromos.length === 0 && !liveFlash) return null;

  const heading =
    activeAnnouncement?.title ?? liveFlash?.title ?? activePromos[0]?.title ?? "";
  const sub =
    activeAnnouncement?.subtitle ??
    activeAnnouncement?.body ??
    liveFlash?.description ??
    activePromos[0]?.subtitle ??
    activePromos[0]?.body;
  const savePill = liveFlash
    ? discountLabel(liveFlash)
    : activePromos.length > 0
      ? `${activePromos.length} active offer${activePromos.length === 1 ? "" : "s"}`
      : null;
  const eyebrow = liveFlash ? "Flash Sale \u00B7 Live" : "Announcements";

  return (
    <section className="w-full py-8" aria-label="Promotions">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
          className="relative flex flex-col items-center justify-between gap-6 overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-r from-[#201a18] via-[#3d1908] to-[#201a18] p-6 text-white shadow-[0_20px_40px_rgba(247,103,7,0.18)] md:flex-row md:p-8"
        >
          {/* Static decorative flares (presentation only) */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-amber-500/30 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-rose-500/25 blur-3xl"
          />

          <div className="relative z-10 flex items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-400/20 to-orange-500/30 shadow-inner backdrop-blur-md">
              <Flame className="h-8 w-8 text-amber-300" aria-hidden />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  {eyebrow}
                </span>
                {savePill && (
                  <span className="rounded-full bg-gradient-to-r from-amber-500 to-rose-500 px-2.5 py-0.5 text-[10px] font-black uppercase text-white">
                    {savePill}
                  </span>
                )}
              </div>
              <h2 className="font-culinary-heading mt-1 text-xl font-bold text-white md:text-2xl">
                {heading}
              </h2>
              {sub && (
                <p className="mt-0.5 text-xs text-amber-200/80">{sub}</p>
              )}
            </div>
          </div>

          <div className="relative z-10 flex shrink-0 items-center gap-5">
            {/* Live countdown — existing data + existing component only */}
            {liveFlash && (
              <div className="hidden flex-col text-right sm:flex">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/70">
                  Ends In
                </span>
                <span className="text-sm font-bold text-amber-300">
                  <CountdownTimer target={liveFlash.endsAt} hideDaysIfZero={true} />
                </span>
              </div>
            )}
            {/* Real coupon code — static display, no copy mechanism exists */}
            {liveFlash?.code && (
              <span className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-base font-extrabold tracking-wider text-amber-300 backdrop-blur-xl">
                {liveFlash.code}
              </span>
            )}
            {/* Real announcement destination only */}
            {activeAnnouncement?.buttonLink && (
              <Link to={activeAnnouncement.buttonLink}>
                <Button variant="crunch" size="sm" className="gap-1.5">
                  {activeAnnouncement.buttonText ?? "Learn More"}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </Link>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
