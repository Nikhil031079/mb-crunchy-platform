import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  ThumbsUp,
  BadgeCheck,
  MessageSquare,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { cn } from "@/lib/utils";
import { formatDate } from "@/utils";

import { useAuth } from "@/hooks/use-auth";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

import type { Review, ReviewStats } from "@/types";

// ============================================================================
// Types
// ============================================================================

interface ReviewSectionProps {
  catalogItemId: string;
  businessUnitId: string;
}

// ============================================================================
// Star Rating Selector (interactive)
// ============================================================================

function StarRatingSelector({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange: (rating: number) => void;
  size?: "sm" | "md" | "lg";
}) {
  const [hovered, setHovered] = useState(0);

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-7 w-7",
  };

  return (
    <div
      className="flex items-center gap-0.5"
      onMouseLeave={() => setHovered(0)}
      role="radiogroup"
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = hovered ? star <= hovered : star <= value;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={star === value}
            aria-label={`${star} star${star !== 1 ? "s" : ""}`}
            className="cursor-pointer rounded-sm p-0.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onMouseEnter={() => setHovered(star)}
            onClick={() => onChange(star)}
          >
            <Star
              className={cn(
                sizeClasses[size],
                "transition-colors",
                filled
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/30"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Star Display (read-only)
// ============================================================================

function StarDisplay({
  rating,
  size = "sm",
}: {
  rating: number;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            sizeClasses[size],
            star <= rating
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Rating Distribution Bar
// ============================================================================

function RatingBar({
  stars,
  count,
  total,
}: {
  stars: number;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-right text-muted-foreground">{stars}</span>
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full rounded-full bg-amber-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, delay: (5 - stars) * 0.08 }}
        />
      </div>
      <span className="w-6 text-right text-muted-foreground">{count}</span>
    </div>
  );
}

// ============================================================================
// Review Summary Card
// ============================================================================

function ReviewSummaryCard({ stats }: { stats: ReviewStats }) {
  return (
    <Card className="border-border/40">
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
        {/* Average rating */}
        <div className="flex flex-col items-center gap-1 sm:min-w-[120px]">
          <span className="text-4xl font-bold tabular-nums">
            {stats.average > 0 ? stats.average.toFixed(1) : "–"}
          </span>
          <StarDisplay rating={Math.round(stats.average)} size="md" />
          <span className="text-xs text-muted-foreground">
            {stats.count} review{stats.count !== 1 ? "s" : ""}
          </span>
        </div>

        <Separator className="hidden sm:block sm:h-20 sm:w-px sm:rotate-0" orientation="vertical" />

        {/* Distribution */}
        <div className="flex-1 space-y-1.5">
          {[5, 4, 3, 2, 1].map((stars) => (
            <RatingBar
              key={stars}
              stars={stars}
              count={stats.distribution[stars - 1] ?? 0}
              total={stats.count}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Write Review Form
// ============================================================================

function WriteReviewForm({
  catalogItemId,
  businessUnitId,
  customerId,
  existingReview,
  onSubmitted,
}: {
  catalogItemId: string;
  businessUnitId: string;
  customerId: string;
  existingReview: Review | null;
  onSubmitted: () => void;
}) {
  const createReview = useMutation(api.reviews.create);
  const updateReview = useMutation(api.reviews.update);

  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [title, setTitle] = useState(existingReview?.title ?? "");
  const [body, setBody] = useState(existingReview?.body ?? "");
  const [submitting, setSubmitting] = useState(false);

  const isEditing = !!existingReview;

  const handleSubmit = useCallback(async () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    setSubmitting(true);
    try {
      if (isEditing) {
        await updateReview({
          reviewId: existingReview._id as Id<"reviews">,
          customerId: customerId as Id<"customers">,
          rating,
          title: title.trim() || undefined,
          body: body.trim() || undefined,
          images: [],
        });
        toast.success("Review updated");
      } else {
        await createReview({
          businessUnitId: businessUnitId as Id<"businessUnits">,
          catalogItemId: catalogItemId as Id<"catalogItems">,
          customerId: customerId as Id<"customers">,
          rating,
          title: title.trim() || undefined,
          body: body.trim() || undefined,
          images: [],
        });
        toast.success("Review submitted");
      }
      onSubmitted();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    rating,
    title,
    body,
    isEditing,
    existingReview,
    customerId,
    catalogItemId,
    businessUnitId,
    createReview,
    updateReview,
    onSubmitted,
  ]);

  return (
    <Card className="border-border/40">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {isEditing ? "Edit Your Review" : "Write a Review"}
          </h3>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Your Rating</label>
          <StarRatingSelector value={rating} onChange={setRating} size="lg" />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="review-title" className="text-xs font-medium text-muted-foreground">
            Title <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <input
            id="review-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Summarize your experience"
            maxLength={100}
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px]"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="review-body" className="text-xs font-medium text-muted-foreground">
            Your Review <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <Textarea
            id="review-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tell others about your experience..."
            rows={4}
            maxLength={1000}
          />
          <p className="text-right text-[10px] text-muted-foreground">
            {body.length}/1000
          </p>
        </div>

        <Button onClick={handleSubmit} disabled={submitting || rating === 0} className="w-full sm:w-auto">
          {submitting ? "Submitting..." : isEditing ? "Update Review" : "Submit Review"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Individual Review Card
// ============================================================================

function ReviewCard({
  review,
  customerId,
  index,
}: {
  review: Review;
  customerId?: string;
  index: number;
}) {
  const markHelpful = useMutation(api.reviews.markHelpful);
  const [hasMarkedHelpful, setHasMarkedHelpful] = useState(false);

  const isOwnReview = !!(customerId && review.customerId === customerId);

  const handleHelpful = useCallback(async () => {
    if (hasMarkedHelpful) return;
    try {
      await markHelpful({ reviewId: review._id as Id<"reviews"> });
      setHasMarkedHelpful(true);
    } catch {
      toast.error("Could not mark as helpful");
    }
  }, [markHelpful, review._id, hasMarkedHelpful]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card className="border-border/40 py-4">
        <CardContent className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <StarDisplay rating={review.rating} />
              {review.title && (
                <h4 className="text-sm font-semibold leading-tight">{review.title}</h4>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {review.verifiedPurchase && (
                <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800">
                  <BadgeCheck className="h-3 w-3" />
                  Verified Purchase
                </Badge>
              )}
              {isOwnReview && (
                <Badge variant="outline" className="text-[10px]">
                  Your Review
                </Badge>
              )}
            </div>
          </div>

          {/* Body */}
          {review.body && (
            <p className="text-sm leading-relaxed text-muted-foreground">{review.body}</p>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
            <span>{formatDate(review.createdAt, "short")}</span>
            <button
              type="button"
              onClick={handleHelpful}
              disabled={hasMarkedHelpful || isOwnReview}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                hasMarkedHelpful
                  ? "text-primary font-medium"
                  : "hover:bg-secondary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              <ThumbsUp className="h-3 w-3" />
              Helpful{review.helpfulCount > 0 ? ` (${review.helpfulCount + (hasMarkedHelpful ? 1 : 0)})` : ""}
            </button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ============================================================================
// ReviewSection — Main Export
// ============================================================================

export function ReviewSection({
  catalogItemId,
  businessUnitId,
}: ReviewSectionProps) {
  const { isAuthenticated, user } = useAuth();
  const customer = useQuery(api.customers.getByAuthUser, {});

  const reviews = useQuery(api.reviews.getByCatalogItem, {
    catalogItemId: catalogItemId as Id<"catalogItems">,
  }) as Review[] | undefined;

  const stats = useQuery(api.reviews.getStats, {
    catalogItemId: catalogItemId as Id<"catalogItems">,
  }) as ReviewStats | undefined;

  const existingReview = useQuery(
    api.reviews.getCustomerReview,
    customer?._id
      ? {
          catalogItemId: catalogItemId as Id<"catalogItems">,
          customerId: customer._id as Id<"customers">,
        }
      : "skip"
  ) as Review | null | undefined;

  const customerId = customer?._id as string | undefined;
  const hasExistingReview = existingReview !== undefined && existingReview !== null;

  const isLoading = reviews === undefined || stats === undefined;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-secondary" />
        <div className="h-32 animate-pulse rounded-xl bg-secondary" />
        <div className="h-40 animate-pulse rounded-xl bg-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-bold tracking-tight">
          Customer Reviews
          {stats.count > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({stats.count})
            </span>
          )}
        </h2>
      </div>

      {/* Summary */}
      {stats.count > 0 && <ReviewSummaryCard stats={stats} />}

      {/* Write Review */}
      {isAuthenticated && customerId && (
        <AnimatePresence mode="wait">
          {existingReview === undefined ? (
            <div key="loading" className="h-20 animate-pulse rounded-xl bg-secondary" />
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <WriteReviewForm
                catalogItemId={catalogItemId}
                businessUnitId={businessUnitId}
                customerId={customerId}
                existingReview={hasExistingReview ? existingReview : null}
                onSubmitted={() => {}}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {!isAuthenticated && (
        <Card className="border-border/40 border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Sign in to leave a review
            </p>
          </CardContent>
        </Card>
      )}

      {/* Review List */}
      <div className="space-y-3">
        <AnimatePresence>
          {reviews.map((review, i) => (
            <ReviewCard
              key={review._id}
              review={review}
              customerId={customerId}
              index={i}
            />
          ))}
        </AnimatePresence>

        {reviews.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No reviews yet. Be the first to share your experience!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
