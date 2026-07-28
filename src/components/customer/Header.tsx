import { useState, useCallback } from "react";
import { Link, useLocation } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, User, Menu, X, ChefHat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/constants";
import { useBranding } from "@/hooks/use-branding";
import { cn } from "@/lib/utils";

import { DesktopNav } from "./DesktopNav";
import { MobileNav } from "./MobileNav";
import { BusinessUnitSwitcher } from "./BusinessUnitSwitcher";

import type { BusinessUnit } from "@/types";

interface HeaderProps {
  businessUnits?: BusinessUnit[];
  currentBusinessUnitSlug?: string;
  cartItemCount?: number;
  onBusinessUnitChange?: (slug: string) => void;
  className?: string;
  hideSignIn?: boolean;
}

export function Header({
  businessUnits = [],
  currentBusinessUnitSlug,
  cartItemCount = 0,
  onBusinessUnitChange,
  className,
  hideSignIn = false,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { siteName, logo } = useBranding();

  const activeBusinessUnits = businessUnits.filter(
    (bu) => bu.status === "active" && bu.homepageVisible
  );

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Logo + Business Unit Switcher */}
        <div className="flex items-center gap-4">
          <Link
            to={ROUTES.HOME}
            className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-80"
            aria-label={`${siteName} Home`}
          >
            {logo ? (
              <img src={logo} alt={siteName} className="h-9 w-9 rounded-lg object-contain" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <ChefHat className="h-5 w-5" />
              </div>
            )}
            <span className="hidden text-lg font-bold tracking-tight sm:inline">
              {siteName}
            </span>
          </Link>

          {activeBusinessUnits.length > 1 && onBusinessUnitChange && (
            <div className="hidden sm:block">
              <BusinessUnitSwitcher
                businessUnits={activeBusinessUnits}
                currentSlug={currentBusinessUnitSlug}
                onChange={onBusinessUnitChange}
              />
            </div>
          )}
        </div>

        {/* Center: Desktop Navigation */}
        <DesktopNav
          businessUnits={activeBusinessUnits}
          currentPath={location.pathname}
          className="hidden lg:flex"
        />

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {/* Cart */}
          <Link to={ROUTES.CART} aria-label="Shopping cart">
            <Button variant="ghost" size="icon" className="relative">
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <Badge
                  variant="default"
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent p-0 text-[10px] font-bold text-accent-foreground"
                >
                  {cartItemCount > 99 ? "99+" : cartItemCount}
                </Badge>
              )}
            </Button>
          </Link>

          {/* Sign In */}
          {!hideSignIn && (
            <Link to={ROUTES.AUTH}>
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex gap-2"
              >
                <User className="h-4 w-4" />
                Sign In
              </Button>
            </Link>
          )}

          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleMobileMenu}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            <AnimatePresence mode="wait">
              {mobileMenuOpen ? (
                <motion.div
                  key="x"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <X className="h-5 w-5" />
                </motion.div>
              ) : (
                <motion.div
                  key="menu"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Menu className="h-5 w-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={closeMobileMenu}
        businessUnits={activeBusinessUnits}
        currentPath={location.pathname}
        currentBusinessUnitSlug={currentBusinessUnitSlug}
        onBusinessUnitChange={onBusinessUnitChange}
        cartItemCount={cartItemCount}
      />
    </header>
  );
}
