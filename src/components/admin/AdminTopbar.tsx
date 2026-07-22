import { Bell, ChevronDown, Menu, UserRound } from "lucide-react";
import { Link } from "react-router";

import { AdminBreadcrumbs } from "./AdminBreadcrumbs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROUTES } from "@/constants";

interface AdminTopbarProps {
  title: string;
  group?: string;
  onOpenMobileNavigation: () => void;
}

export function AdminTopbar({ title, group, onOpenMobileNavigation }: AdminTopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMobileNavigation}
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <AdminBreadcrumbs group={group} currentPage={title} />
        <h1 className="mt-0.5 truncate text-base font-semibold tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-1.5">
        <Button type="button" variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="size-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Open user menu">
              <Avatar className="size-7 border border-border">
                <AvatarFallback className="text-xs font-semibold">AD</AvatarFallback>
              </Avatar>
              <span className="hidden text-left text-sm font-medium sm:inline">Administrator</span>
              <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <span className="block text-sm">Administrator</span>
              <span className="block text-xs font-normal text-muted-foreground">User menu placeholder</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserRound /> Profile settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={ROUTES.HOME}>View storefront</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
