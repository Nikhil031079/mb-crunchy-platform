import { Link } from "react-router";
import { ChefHat, Mail, Phone, MapPin, Heart } from "lucide-react";

import { SITE_NAME, ROUTES } from "@/constants";
import { cn } from "@/lib/utils";

import type { BusinessUnit } from "@/types";

interface FooterProps {
  businessUnits?: BusinessUnit[];
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
  };
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  className?: string;
}

export function Footer({
  businessUnits = [],
  socialLinks,
  contactEmail,
  contactPhone,
  address,
  className,
}: FooterProps) {
  const currentYear = new Date().getFullYear();
  const activeBusinessUnits = businessUnits.filter(
    (bu) => bu.status === "active"
  );

  return (
    <footer className={cn("border-t border-border/40 bg-secondary/30", className)}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Main Grid */}
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4 lg:col-span-1">
            <Link
              to={ROUTES.HOME}
              className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <ChefHat className="h-5 w-5" />
              </div>
              <span className="text-lg font-bold">{SITE_NAME}</span>
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your premium destination for quality products and exceptional service
              across multiple business lines.
            </p>

            {/* Social Links */}
            {socialLinks && (
              <div className="flex items-center gap-2 pt-2">
                {socialLinks.instagram && (
                  <a
                    href={socialLinks.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                    aria-label="Instagram"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                  </a>
                )}
                {socialLinks.facebook && (
                  <a
                    href={socialLinks.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                    aria-label="Facebook"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </a>
                )}
                {socialLinks.twitter && (
                  <a
                    href={socialLinks.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                    aria-label="Twitter"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold tracking-tight">Quick Links</h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to={ROUTES.HOME}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.CART}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cart
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.CHECKOUT}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Checkout
                </Link>
              </li>
              <li>
                <Link
                  to={ROUTES.AUTH}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Sign In
                </Link>
              </li>
            </ul>
          </div>

          {/* Business Units */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold tracking-tight">Our Services</h4>
            {activeBusinessUnits.length > 0 ? (
              <ul className="space-y-3">
                {activeBusinessUnits.map((bu) => (
                  <li key={bu._id}>
                    <Link
                      to={`/${bu.slug}`}
                      className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {bu.logo ? (
                        <img
                          src={bu.logo}
                          alt=""
                          className="h-4 w-4 rounded object-cover"
                        />
                      ) : (
                        <div
                          className="h-4 w-4 rounded"
                          style={{ backgroundColor: bu.themeColor || "#000" }}
                        />
                      )}
                      {bu.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-3">
                <li>
                  <span className="text-sm text-muted-foreground">MB Kitchen</span>
                </li>
                <li>
                  <span className="text-sm text-muted-foreground">MB Mart</span>
                </li>
                <li>
                  <span className="text-sm text-muted-foreground">More coming soon</span>
                </li>
              </ul>
            )}
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold tracking-tight">Contact</h4>
            <ul className="space-y-3">
              {contactPhone && (
                <li className="flex items-start gap-2.5">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <a
                    href={`tel:${contactPhone}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {contactPhone}
                  </a>
                </li>
              )}
              {contactEmail && (
                <li className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <a
                    href={`mailto:${contactEmail}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {contactEmail}
                  </a>
                </li>
              )}
              {address && (
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{address}</span>
                </li>
              )}
              {!contactPhone && !contactEmail && !address && (
                <li>
                  <span className="text-sm text-muted-foreground">
                    Get in touch with our team for support and inquiries.
                  </span>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {currentYear} {SITE_NAME}. All rights reserved.
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Made with <Heart className="h-3 w-3 text-accent" /> by the {SITE_NAME} team
          </p>
        </div>
      </div>
    </footer>
  );
}
