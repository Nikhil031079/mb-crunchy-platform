import { memo } from "react";
import { motion } from "framer-motion";
import { Star, StarHalf, Quote } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatDate, getInitials } from "@/utils";

interface CustomerReviewCardProps {
  rating: number;
  text: string;
  authorName: string;
  authorAvatar?: string;
  date?: number;
  location?: string;
  index?: number;
  className?: string;
  featured?: boolean;
}

export const CustomerReviewCard = memo(function CustomerReviewCard({
  rating,
  text,
  authorName,
  authorAvatar,
  date,
  location,
  index = 0,
  className,
  featured = false,
}: CustomerReviewCardProps) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-300",
          featured
            ? "border-accent/20 shadow-md"
            : "hover:shadow-md hover:border-border/80",
          className
        )}
      >
        {/* Featured indicator */}
        {featured && (
          <div className="absolute right-0 top-0">
            <div className="h-16 w-16 bg-accent/10 [clip-path:polygon(100%_0,0_0,100%_100%)]" />
          </div>
        )}

        <CardContent className="p-5">
          {/* Quote icon */}
          <Quote className="mb-3 h-6 w-6 text-accent/20" />

          {/* Rating Stars */}
          <div className="mb-3 flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => {
              if (i < fullStars) {
                return (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-amber-400 text-amber-400"
                  />
                );
              }
              if (i === fullStars && hasHalfStar) {
                return (
                  <StarHalf
                    key={i}
                    className="h-4 w-4 fill-amber-400 text-amber-400"
                  />
                );
              }
              return (
                <Star
                  key={i}
                  className="h-4 w-4 text-muted-foreground/30"
                />
              );
            })}
          </div>

          {/* Review Text */}
          <blockquote className="text-sm leading-relaxed text-muted-foreground">
            &ldquo;{text}&rdquo;
          </blockquote>

          {/* Author Info */}
          <div className="mt-4 flex items-center gap-3">
            <Avatar className="h-9 w-9 border">
              {authorAvatar ? (
                <AvatarImage src={authorAvatar} alt={authorName} />
              ) : null}
              <AvatarFallback className="bg-secondary text-xs font-medium">
                {getInitials(authorName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">{authorName}</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                {location && <span>{location}</span>}
                {date && (
                  <>
                    {location && <span>&middot;</span>}
                    <span>{formatDate(date, "short")}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

/**
 * CustomerReviewCardSkeleton — loading placeholder
 */
export function CustomerReviewCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="h-6 w-6 animate-pulse rounded bg-secondary" />
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 w-4 animate-pulse rounded bg-secondary" />
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-full animate-pulse rounded bg-secondary" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <div className="h-9 w-9 animate-pulse rounded-full bg-secondary" />
          <div className="space-y-1.5">
            <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
            <div className="h-2 w-16 animate-pulse rounded bg-secondary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
