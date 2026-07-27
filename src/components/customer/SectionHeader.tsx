import { memo } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  alignment?: "left" | "center";
  size?: "sm" | "default" | "lg";
  className?: string;
}

export const SectionHeader = memo(function SectionHeader({
  title,
  subtitle,
  action,
  alignment = "left",
  size = "default",
  className,
}: SectionHeaderProps) {
  const titleSize = {
    sm: "text-lg sm:text-xl",
    default: "text-xl sm:text-2xl",
    lg: "text-2xl sm:text-3xl",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4 }}
      className={cn(
        "flex flex-col gap-2",
        alignment === "center" ? "items-center text-center" : "items-start",
        className
      )}
    >
      {/* Title with decorative accent bar */}
      <div className="relative">
        {alignment === "left" && (
          <div className="mb-2 h-1 w-8 rounded-full bg-accent" />
        )}
        <h2 className={cn("font-bold tracking-tight", titleSize[size])}>
          {title}
        </h2>
      </div>

      {/* Subtitle */}
      {subtitle && (
        <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
          {subtitle}
        </p>
      )}

      {/* Action */}
      {action && (
        <div className={alignment === "center" ? "mt-2" : "mt-1"}>
          <Button
            variant="ghost"
            size="sm"
            onClick={action.onClick}
            className={cn(
              "group gap-1.5 text-sm font-medium",
              "text-muted-foreground hover:text-foreground"
            )}
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      )}
    </motion.div>
  );
});

/**
 * SectionHeaderSkeleton — loading placeholder
 */
export function SectionHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
      <div className="h-7 w-48 animate-pulse rounded bg-secondary" />
      <div className="h-4 w-64 animate-pulse rounded bg-secondary" />
    </div>
  );
}
