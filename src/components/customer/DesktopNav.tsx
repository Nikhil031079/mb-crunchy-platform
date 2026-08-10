import { Link } from "react-router";
import { motion } from "framer-motion";
import { Package } from "lucide-react";

import { cn } from "@/lib/utils";
import { ROUTES } from "@/constants";

import type { BusinessUnit } from "@/types";

interface DesktopNavProps {
  businessUnits: BusinessUnit[];
  currentPath: string;
  className?: string;
}

export function DesktopNav({
  businessUnits,
  currentPath,
  className,
}: DesktopNavProps) {
  return (
    <nav className={cn("items-center gap-0.5", className)} aria-label="Main navigation">
      {businessUnits.map((bu, index) => {
        const isActive = currentPath === `/${bu.slug}`;

        return (
          <Link
            key={bu._id}
            to={`/${bu.slug}`}
            className={cn(
              "relative px-3 py-2 text-sm font-medium rounded-md transition-colors",
              "hover:bg-secondary/80",
              isActive
                ? "text-accent"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {bu.name}
            {isActive && (
              <motion.span
                layoutId="desktop-nav-active"
                className="absolute inset-0 rounded-md bg-accent/8"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </Link>
        );
      })}
      <Link
        to={ROUTES.TRACK_ORDER}
        className={cn(
          "relative px-3 py-2 text-sm font-medium rounded-md transition-colors",
          "hover:bg-secondary/80",
          currentPath === ROUTES.TRACK_ORDER
            ? "text-accent"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Package className="inline h-4 w-4 mr-1.5" />
        Track Order
      </Link>
    </nav>
  );
}

/**
 * DesktopNavSkeleton — loading placeholder for DesktopNav
 */
export function DesktopNavSkeleton() {
  return (
    <div className="hidden lg:flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-9 w-20 animate-pulse rounded-md bg-secondary"
        />
      ))}
    </div>
  );
}
