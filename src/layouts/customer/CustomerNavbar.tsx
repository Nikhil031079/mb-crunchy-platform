import { useState } from "react";
import { Link, useLocation } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ShoppingCart, ChefHat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SITE_NAME, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";

import { StoreStatusDot } from "@/components/customer/StoreStatusBadge";

import type { BusinessUnit, BusinessUnitSettings } from "@/types";

interface CustomerNavbarProps {
  businessUnits: BusinessUnit[];
  cartItemCount?: number;
  settingsMap?: Map<string, BusinessUnitSettings>;
}

export function CustomerNavbar({
  businessUnits,
  cartItemCount = 0,
  settingsMap,
}: CustomerNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  const activeBusinessUnits = businessUnits.filter(
    (bu) => bu.status === "active" && bu.homepageVisible
  );

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
            <span className="text-lg font-bold tracking-tight">{SITE_NAME}</span>
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
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
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

            <Link to={ROUTES.AUTH}>
              <Button variant="default" size="sm" className="hidden sm:flex">
                Sign In
              </Button>
            </Link>

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
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
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
              <div className="pt-2">
                <Link
                  to={ROUTES.AUTH}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Button variant="default" size="sm" className="w-full">
                    Sign In
                  </Button>
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
