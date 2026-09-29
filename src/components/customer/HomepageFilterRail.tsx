import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Store } from "lucide-react";

import { cn } from "@/lib/utils";

import type { BusinessUnit } from "@/types";

// ============================================================================
// HomepageFilterRail — Stitch-style glass mode/filter rail.
//
// LEFT: mode/store toggle linking to the real Kitchen/Mart store pages
// (existing navigation — no new state, no invented filters).
// RIGHT: anchor pills jumping to real homepage sections. The selected
// (saffron gradient) state reflects the section currently in view via an
// IntersectionObserver (same presentational pattern as CategoryPage's
// scroll-spy) plus the last-tapped pill. No filtering logic is added or
// changed anywhere.
// ============================================================================

const SECTION_LINKS = [
  { id: "best-sellers", label: "Best Sellers" },
  { id: "today-specials", label: "Today's Specials" },
  { id: "recommended-for-you", label: "Recommended" },
  { id: "categories", label: "Categories" },
];

interface HomepageFilterRailProps {
  kitchenBU?: BusinessUnit | null;
  martBU?: BusinessUnit | null;
}

export function HomepageFilterRail({ kitchenBU, martBU }: HomepageFilterRailProps) {
  const [activeId, setActiveId] = useState("");

  // Scroll-spy — highlight the homepage section currently in view.
  // Runs after every render (no dep array) so sections that resolve
  // asynchronously are picked up once they mount. Presentational only.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            return;
          }
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 },
    );
    for (const link of SECTION_LINKS) {
      const el = document.getElementById(link.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  });

  if (!kitchenBU && !martBU) return null;

  const pillBase =
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition-all";

  return (
    <section aria-label="Homepage quick navigation" className="w-full">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="glass-tier-1 flex flex-col items-center justify-between gap-4 rounded-3xl p-3 md:flex-row">
          {/* Mode/store toggle — real store destinations */}
          <div className="flex items-center gap-2">
            {kitchenBU && (
              <Link
                to={`/${kitchenBU.slug}`}
                className={cn(pillBase, "badge-glass")}
                aria-label={`Shop ${kitchenBU.name}`}
              >
                {kitchenBU.logo ? (
                  <img
                    src={kitchenBU.logo}
                    alt=""
                    aria-hidden
                    className="h-5 w-5 rounded object-cover"
                  />
                ) : (
                  <Store className="h-4 w-4" aria-hidden />
                )}
                {kitchenBU.name}
              </Link>
            )}
            {martBU && (
              <Link
                to={`/${martBU.slug}`}
                className={cn(pillBase, "badge-glass")}
                aria-label={`Shop ${martBU.name}`}
              >
                {martBU.logo ? (
                  <img
                    src={martBU.logo}
                    alt=""
                    aria-hidden
                    className="h-5 w-5 rounded object-cover"
                  />
                ) : (
                  <Store className="h-4 w-4" aria-hidden />
                )}
                {martBU.name}
              </Link>
            )}
          </div>

          {/* Section anchors — real in-page destinations */}
          <nav
            aria-label="Homepage sections"
            className="flex w-full items-center gap-2 overflow-x-auto pb-1 md:w-auto md:pb-0"
          >
            {SECTION_LINKS.map((link) => {
              const isActive = activeId === link.id;
              return (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  onClick={() => setActiveId(link.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    pillBase,
                    isActive
                      ? "bg-gradient-to-r from-culinary-primary-deep to-culinary-primary text-white shadow-md"
                      : "badge-glass hover:text-culinary-primary",
                  )}
                >
                  {link.label}
                </a>
              );
            })}
          </nav>
        </div>
      </div>
    </section>
  );
}
