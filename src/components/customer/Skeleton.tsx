import { cn } from "@/lib/utils";

// ============================================================================
// Base Skeleton
// ============================================================================

interface SkeletonBaseProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonBaseProps) {
  return (
    <div className={cn("animate-pulse rounded-md bg-secondary", className)} />
  );
}

// ============================================================================
// Card Grid Skeleton
// ============================================================================

interface CardGridSkeletonProps {
  count?: number;
  columns?: 2 | 3 | 4;
  type?: "product" | "category" | "combo" | "businessUnit";
}

export function CardGridSkeleton({
  count = 8,
  columns = 4,
  type = "product",
}: CardGridSkeletonProps) {
  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  };

  const cardHeight = type === "businessUnit" ? "h-40" : type === "category" ? "h-52" : "h-72";

  return (
    <div className={cn("grid gap-4 sm:gap-6", gridCols[columns])}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border/60">
          <div className={cn("animate-pulse bg-secondary", cardHeight)} />
          <div className="p-4 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Page Skeleton
// ============================================================================

interface PageSkeletonProps {
  withHeader?: boolean;
  withFilters?: boolean;
  cardCount?: number;
  className?: string;
}

export function PageSkeleton({
  withHeader = true,
  withFilters = false,
  cardCount = 8,
  className,
}: PageSkeletonProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {withHeader && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      )}
      {withFilters && (
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-40 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      )}
      <CardGridSkeleton count={cardCount} />
    </div>
  );
}

// ============================================================================
// List Skeleton (for mobile/compact views)
// ============================================================================

interface ListSkeletonProps {
  count?: number;
  withAvatar?: boolean;
  className?: string;
}

export function ListSkeleton({
  count = 5,
  withAvatar = true,
  className,
}: ListSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
        >
          {withAvatar && <Skeleton className="h-10 w-10 rounded-full" />}
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Text Block Skeleton
// ============================================================================

interface TextBlockSkeletonProps {
  lines?: number;
  className?: string;
}

export function TextBlockSkeleton({ lines = 3, className }: TextBlockSkeletonProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
