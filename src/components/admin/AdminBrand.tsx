import { ChefHat } from "lucide-react";
import { Link } from "react-router";

import { ROUTES } from "@/constants";
import { useBranding } from "@/hooks/use-branding";
import { cn } from "@/lib/utils";

interface AdminBrandProps {
  compact?: boolean;
  className?: string;
}

export function AdminBrand({ compact = false, className }: AdminBrandProps) {
  const { siteName, logo } = useBranding();

  return (
    <Link
      to={ROUTES.ADMIN.DASHBOARD}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact && "justify-center",
        className,
      )}
    >
      {logo ? (
        <img src={logo} alt={siteName} className="size-9 shrink-0 rounded-lg object-contain" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ChefHat className="size-4" aria-hidden="true" />
        </span>
      )}
      {!compact && (
        <span className="min-w-0 truncate text-sm font-semibold tracking-tight">
          {siteName}
        </span>
      )}
    </Link>
  );
}
