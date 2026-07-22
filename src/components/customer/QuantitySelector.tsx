import { useCallback } from "react";
import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "default";
  disabled?: boolean;
  className?: string;
}

export function QuantitySelector({
  value,
  onChange,
  min = 0,
  max = 99,
  size = "default",
  disabled = false,
  className,
}: QuantitySelectorProps) {
  const atMin = value <= min;
  const atMax = value >= max;

  const decrement = useCallback(() => {
    if (!atMin && !disabled) {
      onChange(value - 1);
    }
  }, [value, atMin, disabled, onChange]);

  const increment = useCallback(() => {
    if (!atMax && !disabled) {
      onChange(value + 1);
    }
  }, [value, atMax, disabled, onChange]);

  const btnSize = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0 rounded-lg border border-border/60 overflow-hidden",
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        disabled={atMin || disabled}
        onClick={decrement}
        className={cn(
          btnSize,
          "rounded-none border-r border-border/60",
          "text-muted-foreground hover:text-foreground hover:bg-secondary/80",
          "disabled:opacity-30 disabled:cursor-not-allowed"
        )}
        aria-label="Decrease quantity"
      >
        <Minus className={iconSize} />
      </Button>

      <motion.span
        key={value}
        initial={{ scale: 1.1, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.15 }}
        className={cn(
          "flex min-w-[2.5rem] items-center justify-center font-medium tabular-nums",
          textSize,
          disabled && "opacity-50"
        )}
      >
        {value}
      </motion.span>

      <Button
        variant="ghost"
        size="icon"
        disabled={atMax || disabled}
        onClick={increment}
        className={cn(
          btnSize,
          "rounded-none border-l border-border/60",
          "text-muted-foreground hover:text-foreground hover:bg-secondary/80",
          "disabled:opacity-30 disabled:cursor-not-allowed"
        )}
        aria-label="Increase quantity"
      >
        <Plus className={iconSize} />
      </Button>
    </div>
  );
}
