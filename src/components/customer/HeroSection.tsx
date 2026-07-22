import { motion } from "framer-motion";
import { ArrowRight, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HeroAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "secondary";
}

interface HeroSectionProps {
  title: string;
  subtitle?: string;
  description?: string;
  backgroundImage?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  actions?: HeroAction[];
  badge?: string;
  alignment?: "left" | "center" | "right";
  size?: "sm" | "default" | "lg";
  className?: string;
  themeColor?: string;
}

export function HeroSection({
  title,
  subtitle,
  description,
  backgroundImage,
  overlayColor = "oklch(0.11 0 0)",
  overlayOpacity = 0.5,
  actions = [],
  badge,
  alignment = "center",
  size = "default",
  className,
  themeColor,
}: HeroSectionProps) {
  const alignmentClasses = {
    left: "items-start text-left",
    center: "items-center text-center",
    right: "items-end text-right",
  };

  const sizeClasses = {
    sm: "min-h-[300px] py-16",
    default: "min-h-[450px] py-20 md:py-28",
    lg: "min-h-[600px] py-24 md:py-36",
  };

  const contentMaxWidth = alignment === "center" ? "max-w-2xl" : "max-w-xl";

  return (
    <section
      className={cn(
        "relative flex w-full overflow-hidden",
        sizeClasses[size],
        className
      )}
    >
      {/* Background */}
      {backgroundImage ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${backgroundImage})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${overlayColor}, ${overlayColor}dd)`,
              opacity: overlayOpacity,
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: themeColor
              ? `linear-gradient(135deg, ${themeColor}15, ${themeColor}08)`
              : "linear-gradient(135deg, oklch(0.95 0.003 70), oklch(0.95 0.003 50))",
          }}
        />
      )}

      {/* Decorative Elements */}
      {!backgroundImage && themeColor && (
        <div
          className="absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-10"
          style={{ backgroundColor: themeColor }}
        />
      )}
      {!backgroundImage && themeColor && (
        <div
          className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full opacity-10"
          style={{ backgroundColor: themeColor }}
        />
      )}

      {/* Content */}
      <div
        className={cn(
          "relative z-10 mx-auto flex w-full flex-col px-4 sm:px-6 lg:px-8",
          alignmentClasses[alignment],
          contentMaxWidth
        )}
      >
        {/* Badge */}
        {badge && (
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              "border-accent/20 bg-accent/8 text-accent"
            )}
          >
            {badge}
            <ChevronRight className="h-3 w-3" />
          </motion.span>
        )}

        {/* Subtitle */}
        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className={cn(
              "mt-6 text-sm font-semibold uppercase tracking-widest",
              backgroundImage
                ? "text-white/80"
                : "text-accent/80"
            )}
          >
            {subtitle}
          </motion.p>
        )}

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className={cn(
            "mt-3 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl",
            "leading-[1.1]",
            backgroundImage && "text-white"
          )}
        >
          {title}
        </motion.h1>

        {/* Description */}
        {description && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className={cn(
              "mt-4 text-base leading-relaxed sm:text-lg",
              backgroundImage
                ? "text-white/80"
                : "text-muted-foreground"
            )}
          >
            {description}
          </motion.p>
        )}

        {/* Actions */}
        {actions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className={cn(
              "mt-8 flex flex-wrap gap-3",
              alignment === "center" && "justify-center"
            )}
          >
            {actions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || (index === 0 ? "default" : "outline")}
                size="lg"
                onClick={action.onClick}
                className={cn(
                  "gap-2 rounded-full px-6",
                  index === 0 &&
                    backgroundImage &&
                    "bg-white text-black hover:bg-white/90",
                  index > 0 &&
                    backgroundImage &&
                    "border-white/30 text-white hover:bg-white/10"
                )}
              >
                {action.label}
                {index === 0 && <ArrowRight className="h-4 w-4" />}
              </Button>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}

/**
 * HeroSectionSkeleton — loading placeholder
 */
export function HeroSectionSkeleton() {
  return (
    <div className="min-h-[450px] w-full bg-secondary/50 animate-pulse flex items-center">
      <div className="mx-auto max-w-2xl w-full px-4 space-y-6">
        <div className="mx-auto h-6 w-32 rounded-full bg-secondary" />
        <div className="mx-auto h-12 w-3/4 rounded-lg bg-secondary" />
        <div className="mx-auto h-4 w-1/2 rounded bg-secondary" />
        <div className="flex justify-center gap-3 pt-4">
          <div className="h-12 w-36 rounded-full bg-secondary" />
          <div className="h-12 w-36 rounded-full bg-secondary" />
        </div>
      </div>
    </div>
  );
}
