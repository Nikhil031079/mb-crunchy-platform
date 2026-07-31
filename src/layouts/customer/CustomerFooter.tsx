import { Link } from "react-router";
import { useQuery } from "convex/react";
import {
  ChefHat,
  Mail,
  Phone,
  MapPin,
  Heart,
  Clock,
  Utensils,
  ShoppingBasket,
  Instagram,
  Facebook,
  Twitter,
} from "lucide-react";

import { api } from "@convex/_generated/api";

import { ROUTES } from "@/constants";
import { useBranding } from "@/hooks/use-branding";
import { StoreSchedule } from "@/components/customer/StoreStatusBadge";

import type { BusinessUnit, BusinessUnitSettings } from "@/types";

interface CustomerFooterProps {
  businessUnits?: BusinessUnit[];
  settingsMap?: Map<string, BusinessUnitSettings>;
}

function SocialIconLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = icon;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent hover:shadow-sm"
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}

export function CustomerFooter({
  businessUnits = [],
  settingsMap,
}: CustomerFooterProps) {
  const currentYear = new Date().getFullYear();
  const { siteName, siteDescription, logo } = useBranding();
  const globalSettings = useQuery(api.settings.getGlobalSettings);

  const activeBusinessUnits = businessUnits.filter(
    (bu) => bu.status === "active" && bu.homepageVisible,
  );

  const firstSettings = activeBusinessUnits
    .map((bu) => settingsMap?.get(bu._id))
    .find((s) => s !== undefined);

  const kitchenBu =
    activeBusinessUnits.find(
      (bu) =>
        bu.slug.toLowerCase().includes("kitchen") ||
        bu.name.toLowerCase().includes("kitchen"),
    ) ?? activeBusinessUnits[0];

  const martBu =
    activeBusinessUnits.find(
      (bu) =>
        bu.slug.toLowerCase().includes("mart") ||
        bu.name.toLowerCase().includes("mart") ||
        bu.slug.toLowerCase().includes("grocery"),
    ) ?? activeBusinessUnits[1];

  const socialLinks = firstSettings?.socialLinks;
  const supportPhone = globalSettings?.supportPhone ?? firstSettings?.phone;
  const supportEmail = globalSettings?.supportEmail ?? firstSettings?.email;
  const address = firstSettings?.address;
  const openingHours = firstSettings?.openingHours;

  return (
    <footer className="border-t border-border/40 bg-secondary/30">
      {/* Top accent strip */}
      <div className="h-1 w-full bg-gradient-to-r from-accent via-accent/60 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 pb-8 pt-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12">
          {/* Brand */}
          <div className="space-y-4 lg:col-span-4">
            <Link
              to={ROUTES.HOME}
              className="flex items-center gap-3 transition-opacity hover:opacity-80"
            >
              {logo ? (
                <img
                  src={logo}
                  alt={siteName}
                  className="h-10 w-10 rounded-xl object-contain"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <ChefHat className="h-5 w-5" />
                </div>
              )}
              <span className="text-lg font-bold tracking-tight">{siteName}</span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {siteDescription || "Fresh food & grocery delivered fast. One cart, one checkout, one delivery."}
            </p>

            {/* Social Links */}
            {(socialLinks?.instagram || socialLinks?.facebook || socialLinks?.twitter) && (
              <div className="flex items-center gap-2 pt-2">
                {socialLinks.instagram && (
                  <SocialIconLink href={socialLinks.instagram} label="Instagram" icon={Instagram} />
                )}
                {socialLinks.facebook && (
                  <SocialIconLink href={socialLinks.facebook} label="Facebook" icon={Facebook} />
                )}
                {socialLinks.twitter && (
                  <SocialIconLink href={socialLinks.twitter} label="Twitter" icon={Twitter} />
                )}
              </div>
            )}
          </div>

          {/* Kitchen */}
          <div className="space-y-4 lg:col-span-2">
            <h4 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Utensils className="h-4 w-4 text-accent" />
              Kitchen
            </h4>
            {kitchenBu ? (
              <ul className="space-y-2.5">
                <li>
                  <Link
                    to={`/${kitchenBu.slug}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {kitchenBu.name}
                  </Link>
                </li>
                {kitchenBu.description && (
                  <li className="text-xs text-muted-foreground/80">
                    {kitchenBu.description}
                  </li>
                )}
                <li>
                  <Link
                    to={`/${kitchenBu.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                  >
                    Explore Kitchen
                  </Link>
                </li>
              </ul>
            ) : (
              <ul className="space-y-2.5">
                <li className="text-sm text-muted-foreground">MB Kitchen</li>
                <li className="text-xs text-muted-foreground/80">
                  Freshly prepared meals & beverages
                </li>
              </ul>
            )}
          </div>

          {/* Mart */}
          <div className="space-y-4 lg:col-span-2">
            <h4 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <ShoppingBasket className="h-4 w-4 text-accent" />
              Mart
            </h4>
            {martBu ? (
              <ul className="space-y-2.5">
                <li>
                  <Link
                    to={`/${martBu.slug}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {martBu.name}
                  </Link>
                </li>
                {martBu.description && (
                  <li className="text-xs text-muted-foreground/80">
                    {martBu.description}
                  </li>
                )}
                <li>
                  <Link
                    to={`/${martBu.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                  >
                    Shop Mart
                  </Link>
                </li>
              </ul>
            ) : (
              <ul className="space-y-2.5">
                <li className="text-sm text-muted-foreground">MB Mart</li>
                <li className="text-xs text-muted-foreground/80">
                  Organic groceries & everyday essentials
                </li>
              </ul>
            )}
          </div>

          {/* Contact */}
          <div className="space-y-4 lg:col-span-2">
            <h4 className="text-sm font-semibold tracking-tight">Contact</h4>
            <ul className="space-y-3">
              {supportPhone && (
                <li className="flex items-start gap-2.5">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <a
                    href={`tel:${supportPhone}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {supportPhone}
                  </a>
                </li>
              )}
              {supportEmail && (
                <li className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <a
                    href={`mailto:${supportEmail}`}
                    className="break-all text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {supportEmail}
                  </a>
                </li>
              )}
              {address && (
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span className="text-sm text-muted-foreground">{address}</span>
                </li>
              )}
              {!supportPhone && !supportEmail && !address && (
                <li className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span className="text-sm text-muted-foreground">
                    Get in touch with our team for support and inquiries.
                  </span>
                </li>
              )}
            </ul>
          </div>

          {/* Working Hours */}
          <div className="space-y-4 lg:col-span-2">
            <h4 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <Clock className="h-4 w-4 text-accent" />
              Working Hours
            </h4>
            {openingHours ? (
              <StoreSchedule openingHours={openingHours} isOpen={!!firstSettings?.isOpen} />
            ) : (
              <ul className="space-y-2.5">
                <li className="text-sm text-muted-foreground">Open all days</li>
                <li className="text-xs text-muted-foreground/80">
                  Delivery hours may vary by area
                </li>
              </ul>
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {currentYear} {siteName}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link
              to={ROUTES.HOME}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Home
            </Link>
            <Link
              to={ROUTES.CART}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Cart
            </Link>
            <Link
              to={ROUTES.AUTH}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign In
            </Link>
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Made with <Heart className="h-3 w-3 text-accent" /> by the {siteName} team
          </p>
        </div>
      </div>
    </footer>
  );
}
