import { useState } from "react";
import { Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BusinessUnitSettings } from "@/types";

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const DAY_LABELS: Record<string, string> = {
  sunday: "Sun",
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
};

const DAY_LABELS_FULL: Record<string, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function getTodayKey(): string {
  return DAY_NAMES[new Date().getDay()];
}

// ============================================================================
// Compact variant — tiny dot + text, used in navbars
// ============================================================================

interface StoreStatusDotProps {
  isOpen: boolean;
  openingHours?: BusinessUnitSettings["openingHours"];
  className?: string;
}

export function StoreStatusDot({
  isOpen,
  openingHours,
  className,
}: StoreStatusDotProps) {
  const todayKey = getTodayKey();
  const todayHours = openingHours?.[todayKey];

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          isOpen ? "bg-emerald-500" : "bg-red-400"
        )}
      />
      <span className={isOpen ? "text-emerald-600" : "text-red-500"}>
        {isOpen ? "Open" : "Closed"}
      </span>
      {todayHours && (
        <span className="hidden sm:inline text-muted-foreground">
          · {formatTime(todayHours.open)}–{formatTime(todayHours.close)}
        </span>
      )}
    </span>
  );
}

// ============================================================================
// Badge variant — for the BU hero section
// ============================================================================

interface StoreStatusBadgeProps {
  isOpen: boolean;
  openingHours?: BusinessUnitSettings["openingHours"];
  className?: string;
}

export function StoreStatusBadge({
  isOpen,
  openingHours,
  className,
}: StoreStatusBadgeProps) {
  const todayKey = getTodayKey();
  const todayHours = openingHours?.[todayKey];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] font-medium",
          isOpen
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-600"
        )}
      >
        {isOpen ? "Open Now" : "Closed"}
      </Badge>
      {todayHours && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          Today: {formatTime(todayHours.open)} – {formatTime(todayHours.close)}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Schedule panel — full weekly hours, used in footer/detail views
// ============================================================================

interface StoreScheduleProps {
  openingHours?: BusinessUnitSettings["openingHours"];
  isOpen: boolean;
  className?: string;
}

export function StoreSchedule({
  openingHours,
  isOpen,
  className,
}: StoreScheduleProps) {
  const [expanded, setExpanded] = useState(false);
  const todayKey = getTodayKey();

  if (!openingHours || Object.keys(openingHours).length === 0) {
    return null;
  }

  const hasAnyHours = DAY_NAMES.some((day) => openingHours[day]);

  if (!hasAnyHours) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="h-auto px-0 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <Clock className="mr-1.5 h-3.5 w-3.5" />
        Opening Hours
        {expanded ? (
          <ChevronUp className="ml-1 h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="ml-1 h-3.5 w-3.5" />
        )}
      </Button>

      {expanded && (
        <div className="rounded-lg border border-border/60 bg-card p-3 space-y-0">
          {DAY_NAMES.map((day) => {
            const hours = openingHours[day];
            const isToday = day === todayKey;

            return (
              <div
                key={day}
                className={cn(
                  "flex items-center justify-between py-1.5 text-xs",
                  isToday && "font-medium text-foreground",
                  !isToday && "text-muted-foreground"
                )}
              >
                <span>{DAY_LABELS_FULL[day]}</span>
                {hours ? (
                  <span>
                    {formatTime(hours.open)} – {formatTime(hours.close)}
                  </span>
                ) : (
                  <span className="italic">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
