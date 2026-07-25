import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  ShoppingCart,
  ChefHat,
  User,
  LogOut,
  Star,
  Package,
  UserCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { SITE_NAME, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";

import { StoreStatusDot } from "@/components/customer/StoreStatusBadge";

import type { BusinessUnit, BusinessUnitSettings } from "@/types";

interface CustomerNavbarProps {
  businessUnits: BusinessUnit[];
  cartItemCount?: number;
  settingsMap?: Map<string, BusinessUnitSettings>;
  isAuthenticated?: boolean;
  user?: { name?: string; email?: string } | null;
  onSignOut?: () => void;
}

export function CustomerNavbar({
  businessUnits,
  cartItemCount = 0,
  settingsMap,
  isAuthenticated = false,
  user,
  onSignOut,
}: CustomerNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const activeBusinessUnits = businessUnits.filter(
    (bu) => bu.status === "active" && bu.homepageVisible,
  );

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            to={ROUTES.HOME}
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ChefHat className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              {SITE_NAME}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {activeBusinessUnits.map((bu) => {
              const settings = settingsMap?.get(bu._id);
              return (
                <Link
                  key={bu._id}
                  to={`/${bu.slug}`}
                  className={cn(
                    "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    location.pathname === `/${bu.slug}`
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {bu.name}
                    {settings && (
                      <StoreStatusDot
                        isOpen={settings.isOpen}
                        openingHours={settings.openingHours}
                      />
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Link to={ROUTES.CART}>
              <Button variant="ghost" size="icon" className="relative">
                <ShoppingCart className="h-5 w-5" />
                {cartItemCount > 0 && (
                  <Badge
                    variant="default"
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full p-0 text-[10px] font-bold"
                  >
                    {cartItemCount > 99 ? "99+" : cartItemCount}
                  </Badge>
                )}
              </Button>
            </Link>

            {/* Auth: Desktop */}
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="hidden sm:flex">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => navigate(ROUTES.ACCOUNT.ROOT)}
                  >
                    <UserCircle className="mr-2 h-4 w-4" />
                    My Account
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate(ROUTES.ACCOUNT.ORDERS)}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    My Orders
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate(ROUTES.ACCOUNT.LOYALTY)}
                  >
                    <Star className="mr-2 h-4 w-4" />
                    Loyalty
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onSignOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to={ROUTES.AUTH} className="hidden sm:flex">
                <Button variant="default" size="sm">
                  Sign In
                </Button>
              </Link>
            )}

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border/60"
          >
            <nav className="mx-auto max-w-7xl px-4 py-3 space-y-1">
              {activeBusinessUnits.map((bu) => {
                const settings = settingsMap?.get(bu._id);
                return (
                  <Link
                    key={bu._id}
                    to={`/${bu.slug}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors",
                      location.pathname === `/${bu.slug}`
                        ? "bg-accent/10 text-accent"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                    )}
                  >
                    <span>{bu.name}</span>
                    {settings && (
                      <StoreStatusDot
                        isOpen={settings.isOpen}
                        openingHours={settings.openingHours}
                      />
                    )}
                  </Link>
                );
              })}
              <div className="pt-2 space-y-1">
                {isAuthenticated ? (
                  <>
                    <Link
                      to={ROUTES.ACCOUNT.ROOT}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary"
                    >
                      <UserCircle className="h-4 w-4" />
                      My Account
                    </Link>
                    <Link
                      to={ROUTES.ACCOUNT.ORDERS}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary"
                    >
                      <Package className="h-4 w-4" />
                      My Orders
                    </Link>
                    <Link
                      to={ROUTES.ACCOUNT.LOYALTY}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary"
                    >
                      <Star className="h-4 w-4" />
                      Loyalty
                    </Link>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onSignOut?.();
                      }}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary w-full"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <Link
                    to={ROUTES.AUTH}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Button variant="default" size="sm" className="w-full">
                      Sign In
                    </Button>
                  </Link>
                )}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
