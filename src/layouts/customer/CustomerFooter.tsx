import { Link } from "react-router";
import { ChefHat } from "lucide-react";

import { ROUTES } from "@/constants";
import { useBranding } from "@/hooks/use-branding";

export function CustomerFooter() {
  const currentYear = new Date().getFullYear();
  const { siteName, siteDescription, logo } = useBranding();

  return (
    <footer className="border-t border-border/60 bg-secondary/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <Link
              to={ROUTES.HOME}
              className="flex items-center gap-2.5"
            >
              {logo ? (
                <img src={logo} alt={siteName} className="h-8 w-8 rounded-lg object-contain" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ChefHat className="h-4 w-4" />
                </div>
              )}
              <span className="text-base font-bold">{siteName}</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {siteDescription}
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Quick Links</h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  to={ROUTES.HOME}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.CART}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cart
                </Link>
              </li>
            </ul>
          </div>

          {/* Business Units */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Our Services</h4>
            <ul className="space-y-2.5">
              <li>
                <span className="text-sm text-muted-foreground">
                  MB Kitchen
                </span>
              </li>
              <li>
                <span className="text-sm text-muted-foreground">
                  MB Mart
                </span>
              </li>
              <li>
                <span className="text-sm text-muted-foreground">
                  More coming soon
                </span>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">Support</h4>
            <ul className="space-y-2.5">
              <li>
                <span className="text-sm text-muted-foreground">
                  Need help? Reach out to our support team.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border/60 pt-6">
          <p className="text-center text-xs text-muted-foreground">
            &copy; {currentYear} {siteName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
