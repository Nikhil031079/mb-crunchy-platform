import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChefHat, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { BusinessUnit } from "@/types";

interface BusinessUnitSwitcherProps {
  businessUnits: BusinessUnit[];
  currentSlug?: string;
  onChange: (slug: string) => void;
  className?: string;
}

export function BusinessUnitSwitcher({
  businessUnits,
  currentSlug,
  onChange,
  className,
}: BusinessUnitSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = businessUnits.find((bu) => bu.slug === currentSlug) ?? businessUnits[0];

  const handleSelect = useCallback(
    (slug: string) => {
      onChange(slug);
      setOpen(false);
    },
    [onChange]
  );

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  if (!current) return null;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
        className="gap-2 border-border/60 bg-transparent pr-2"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select business unit"
      >
        {current.logo ? (
          <img
            src={current.logo}
            alt=""
            className="h-5 w-5 rounded object-cover"
          />
        ) : (
          <div
            className="flex h-5 w-5 items-center justify-center rounded"
            style={{ backgroundColor: current.themeColor || "#000" }}
          >
            <ChefHat className="h-3 w-3 text-white" />
          </div>
        )}
        <span className="max-w-[100px] truncate text-sm font-medium">
          {current.name}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </motion.div>
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 top-full mt-1.5 min-w-[200px] overflow-hidden rounded-lg border border-border/60 bg-popover p-1 shadow-lg"
            role="listbox"
          >
            {businessUnits.map((bu) => {
              const isSelected = bu.slug === current?.slug;
              return (
                <Link
                  key={bu._id}
                  to={`/${bu.slug}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(bu.slug)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isSelected
                      ? "bg-accent/10 text-accent font-medium"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {bu.logo ? (
                    <img
                      src={bu.logo}
                      alt=""
                      className="h-6 w-6 rounded object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-6 w-6 items-center justify-center rounded"
                      style={{ backgroundColor: bu.themeColor || "#000" }}
                    >
                      <ChefHat className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                  <span className="flex-1 truncate">{bu.name}</span>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                  )}
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * BusinessUnitSwitcherSkeleton — loading placeholder
 */
export function BusinessUnitSwitcherSkeleton() {
  return (
    <div className="h-9 w-36 animate-pulse rounded-md border border-border/60 bg-secondary" />
  );
}
