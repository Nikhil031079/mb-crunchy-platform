import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_COLORS } from "@/constants";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colorClass = STATUS_COLORS[status] || "bg-gray-500/10 text-gray-600 border-gray-200";

  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize font-medium text-[11px] px-2 py-0.5",
        colorClass,
        className
      )}
    >
      {status.replace(/_/g, " ")}
    </Badge>
  );
}
