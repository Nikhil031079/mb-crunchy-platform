import { ChevronRight, Home } from "lucide-react";
import { Link } from "react-router";

import { ROUTES } from "@/constants";

interface AdminBreadcrumbsProps {
  group?: string;
  currentPage: string;
}

export function AdminBreadcrumbs({ group, currentPage }: AdminBreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Link
        to={ROUTES.ADMIN.DASHBOARD}
        className="rounded-sm p-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Home className="size-3.5" aria-label="Admin home" />
      </Link>
      {group && (
        <>
          <ChevronRight className="size-3.5" aria-hidden="true" />
          <span className="truncate">{group}</span>
        </>
      )}
      <ChevronRight className="size-3.5" aria-hidden="true" />
      <span className="truncate font-medium text-foreground" aria-current="page">
        {currentPage}
      </span>
    </nav>
  );
}
