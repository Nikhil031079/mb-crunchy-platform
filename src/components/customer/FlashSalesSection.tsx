import { motion } from "framer-motion";
import { Tag, Clock, Zap, Calendar, ArrowRight } from "lucide-react";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CountdownTimer } from "@/components/customer/CountdownTimer";
import { cn } from "@/lib/utils";
import { formatDate } from "@/utils";

import type { Offer } from "@/types";

interface FlashSalesSectionProps {
  businessUnitId: Id<"businessUnits">;
  className?: string;
}

function getFlashSaleStatus(offer: Offer): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  const now = Date.now();
  const isFlashSale = offer.settings?.isFlashSale === true;
  
  if (!isFlashSale) {
    return { label: "Not a Flash Sale", variant: "secondary" };
  }
  
  if (offer.status !== "active") {
    return { label: "Inactive", variant: "secondary" };
  }
  
  if (now < offer.startsAt) {
    return { label: "Upcoming", variant: "outline" };
  }
  
  if (now > offer.endsAt) {
    return { label: "Ended", variant: "destructive" };
  }
  
  return { label: "Live", variant: "default" };
}

function formatDateTime(timestamp: number): string {
  return `${formatDate(timestamp, "short")}`;
}

export function FlashSalesSection({ businessUnitId, className }: FlashSalesSectionProps) {
  const offers = useQuery(api.offers.getActive, { businessUnitId });
  
  if (!offers || offers.length === 0) return null;

  const flashSaleOffers = offers
    .filter((offer) => offer.settings?.isFlashSale === true)
    .sort((a, b) => (b.settings?.flashSalePriority ?? 0) - (a.settings?.flashSalePriority ?? 0));

  if (flashSaleOffers.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("space-y-4", className)}
      id="flash-sales"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          Flash Sales
        </h2>
        <Badge variant="outline" className="text-xs">
          {flashSaleOffers.length} active
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {flashSaleOffers.map((offer, index) => {
          const status = getFlashSaleStatus(offer);
          const isLive = status.label === "Live";
          const now = Date.now();
          const hasStarted = now >= offer.startsAt;
          const hasEnded = now > offer.endsAt;

          return (
            <motion.div
              key={offer._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={cn(
                "relative group overflow-hidden rounded-xl border border-accent/15 bg-gradient-to-br from-accent/[0.03] to-accent/[0.07] p-4 transition-all hover:shadow-md hover:border-accent/25",
                isLive && "ring-1 ring-amber-500/30"
              )}
            >
              {/* Flash Sale Badge */}
              <div className="absolute top-3 right-3">
                <Badge variant={status.variant} className="text-xs font-medium">
                  {status.label}
                </Badge>
              </div>

              {/* Discount Badge */}
              {offer.discountType && offer.discountValue > 0 && (
                <Badge variant="default" className="mb-3 w-fit bg-accent text-accent-foreground text-xs font-bold">
                  <Tag className="mr-1 h-3 w-3" />
                  {offer.discountType === "percentage" 
                    ? `${offer.discountValue}% OFF` 
                    : `₹${offer.discountValue} OFF`}
                </Badge>
              )}

              {/* Title & Description */}
              <div className="space-y-1.5">
                <h3 className="font-semibold text-sm">{offer.title}</h3>
                {offer.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {offer.description}
                  </p>
                )}
              </div>

              {/* Time Info */}
              <div className="mt-3 space-y-1.5 text-[11px]">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Starts: {formatDateTime(offer.startsAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Ends: {formatDateTime(offer.endsAt)}</span>
                </div>

                {/* Remaining Time / Status */}
                {hasStarted && !hasEnded && (
                  <div className="flex items-center gap-1.5 text-amber-600 font-medium">
                    <Zap className="h-3 w-3" />
                    <CountdownTimer target={offer.endsAt} hideDaysIfZero={true} />
                  </div>
                )}
                {!hasStarted && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Starts in
                    <CountdownTimer target={offer.startsAt} hideDaysIfZero={true} />
                  </div>
                )}
                {hasEnded && (
                  <div className="flex items-center gap-1.5 text-destructive text-xs font-medium">
                    <Clock className="h-3 w-3" />
                    Ended
                    <CountdownTimer target={offer.endsAt} hideDaysIfZero={true} />
                  </div>
                )}
              </div>

              {/* CTA */}
              <Button
                variant={isLive ? "default" : "outline"}
                size="sm"
                className="mt-3 w-full gap-1.5 rounded-lg text-xs"
                disabled={hasEnded}
              >
                {isLive ? "Shop Now" : hasStarted ? "Ended" : "Coming Soon"}
                <ArrowRight className="h-3 w-3" />
              </Button>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}