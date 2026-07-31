import { Link } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, User, ChefHat, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROUTES, SITE_NAME } from "@/constants";
import { cn } from "@/lib/utils";

import type { BusinessUnit } from "@/types";

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  businessUnits: BusinessUnit[];
  currentPath: string;
  currentBusinessUnitSlug?: string;
  onBusinessUnitChange?: (slug: string) => void;
  cartItemCount?: number;
}

export function MobileNav({
  isOpen,
  onClose,
  businessUnits,
  currentPath,
  currentBusinessUnitSlug,
  onBusinessUnitChange,
  cartItemCount = 0,
}: MobileNavProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden border-t border-border/40 lg:hidden"
        >
          <nav className="mx-auto max-w-7xl px-4 py-4 sm:px-6" aria-label="Mobile navigation">
            {/* Business Unit Links */}
            <div className="space-y-0.5">
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Our Services
              </p>
              {businessUnits.map((bu, index) => (
                <motion.div
                  key={bu._id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <Link
                    to={`/${bu.slug}`}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      currentPath === `/${bu.slug}`
                        ? "bg-accent/10 text-accent"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    {bu.logo ? (
                      <img
                        src={bu.logo}
                        alt=""
                        className="h-6 w-6 rounded object-cover"
                      />
                    ) : (
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded"
                        style={{ backgroundColor: bu.themeColor || "#000" }}
                      >
                        <ChefHat className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                    {bu.name}
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Quick Links */}
            <div className="mt-4 space-y-0.5">
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quick Links
              </p>
              <Link
                to={ROUTES.SEARCH}
                onClick={onClose}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Search className="h-4 w-4" />
                Search
              </Link>
              <Link
                to={ROUTES.CART}
                onClick={onClose}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ShoppingCart className="h-4 w-4" />
                Cart
                {cartItemCount > 0 && (
                  <Badge
                    variant="default"
                    className="ml-auto rounded-full bg-accent px-1.5 py-0 text-[10px] font-bold text-accent-foreground"
                  >
                    {cartItemCount}
                  </Badge>
                )}
              </Link>
              <Link
                to={ROUTES.AUTH}
                onClick={onClose}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <User className="h-4 w-4" />
                Sign In
              </Link>
            </div>

            {/* Bottom CTA */}
            <div className="mt-6 border-t border-border/40 pt-4">
              <Button variant="default" size="sm" className="w-full" asChild>
                <Link to={ROUTES.HOME} onClick={onClose}>
                  Browse {SITE_NAME}
                </Link>
              </Button>
            </div>
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
