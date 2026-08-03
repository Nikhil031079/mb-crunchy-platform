import { cn } from "@/lib/utils";
import { useCountdown } from "@/hooks/use-countdown";
import type { CountdownParts } from "@/hooks/use-countdown";

// ============================================================================
// CountdownTimer — live countdown display (no motion yet; reserved for the
// Motion Sprint). Renders Days / Hours / Minutes / Seconds in tile boxes.
// ============================================================================

interface CountdownTimerProps {
  target: number;
  /** Hide the days tile when the target is under 24h away. */
  hideDaysIfZero?: boolean;
  className?: string;
  tileClassName?: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function CountdownTimer({
  target,
  hideDaysIfZero = true,
  className,
  tileClassName,
}: CountdownTimerProps) {
  const parts = useCountdown(target);
  if (!parts || parts.expired) return null;

  const tiles: { label: string; value: string }[] = [
    ...(hideDaysIfZero && parts.days === 0
      ? []
      : [{ label: "Days", value: String(parts.days) }]),
    { label: "Hrs", value: pad(parts.hours) },
    { label: "Min", value: pad(parts.minutes) },
    { label: "Sec", value: pad(parts.seconds) },
  ];

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {tiles.map((tile, index) => (
        <div key={tile.label} className="flex items-center gap-1.5">
          {index > 0 && <span className="text-xs font-bold text-muted-foreground/60">:</span>}
          <div
            className={cn(
              "flex min-w-[2.4rem] flex-col items-center rounded-lg border border-border/60 bg-background px-1.5 py-1",
              tileClassName
            )}
          >
            <span className="text-sm font-bold tabular-nums leading-none">
              {tile.value}
            </span>
            <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {tile.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export type { CountdownParts };
