import { useMemo } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { LayoutGrid, ArrowRight, ImageOff } from "lucide-react";

import { api } from "@convex/_generated/api";

import { cn } from "@/lib/utils";
import { isContentActive, getContentMarketingSettings } from "@/utils";

import { SectionHeader } from "./SectionHeader";

import type { Content } from "@/types";

// ============================================================================
// ContentSection — renders dynamic content cards (contentType "homepageCard")
// within the homepage section flow. Returns null when nothing is active.
// ============================================================================

interface ContentSectionProps {
  className?: string;
}

export function ContentSection({ className }: ContentSectionProps) {
  const cards = useQuery(api.content.getByType, {
    contentType: "homepageCard",
  }) as Content[] | undefined;

  const activeCards = useMemo(() => {
    if (!cards) return undefined;
    return cards
      .filter((c) => c.status === "active" && isContentActive(c))
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .slice(0, 6);
  }, [cards]);

  if (activeCards === undefined) {
    return (
      <section className={cn("py-12 sm:py-16", className)}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-2 h-1 w-8 animate-pulse rounded-full bg-secondary" />
          <div className="mb-6 h-7 w-44 animate-pulse rounded bg-secondary" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-secondary" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (activeCards.length === 0) return null;

  const sectionWidth = getContentMarketingSettings(activeCards[0]).sectionWidth;
  const widthClass = sectionWidth === "full"
    ? "max-w-none px-0"
    : sectionWidth === "narrow"
      ? "max-w-4xl"
      : "max-w-7xl";

  return (
    <section className={cn("py-12 sm:py-16", className)}>
      <div className={cn("mx-auto px-4 sm:px-6 lg:px-8", widthClass)}>
        <div className="mb-2 flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-accent">
            Highlights
          </span>
        </div>
        <SectionHeader
          title="Why You'll Love It"
          subtitle="Curated content from across our stores"
          size="sm"
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeCards.map((card) => (
            <ContentCard key={card._id} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// ContentCard — single homepage content card
// ============================================================================

function ContentCard({ card }: { card: Content }) {
  const image = card.coverImage || card.images?.[0];
  const href = card.buttonLink;
  const settings = getContentMarketingSettings(card);
  const isRich = settings.richText;
  const bodyText = settings.richText ? null : (card.subtitle || card.body);

  const inner = (
    <div
      className={cn(
        "group flex h-full items-center gap-4 rounded-xl border border-border/50 bg-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/25 hover:shadow-md",
        settings.contentBlockStyle === "fullBleed" && "rounded-none border-x-0 border-t-0",
        href && "cursor-pointer"
      )}
      style={settings.backgroundColor ? { backgroundColor: settings.backgroundColor } : undefined}
    >
      {image ? (
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
          <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-secondary/60">
          <ImageOff className="h-6 w-6 text-muted-foreground/40" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <h3 className="font-semibold leading-snug" style={settings.textColor ? { color: settings.textColor } : undefined}>{card.title}</h3>
        {isRich && card.body ? (
          <div
            className="prose-sm mt-1 line-clamp-3 text-sm text-muted-foreground [&_a]:text-accent"
            dangerouslySetInnerHTML={{ __html: card.body }}
          />
        ) : (
          bodyText && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground" style={settings.textColor ? { color: settings.textColor, opacity: 0.8 } : undefined}>
              {bodyText}
            </p>
          )
        )}
        {card.buttonText && (
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent" style={settings.textColor ? { color: settings.textColor } : undefined}>
            {card.buttonText}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div>
      {href ? (
        <Link to={href} className="block h-full">{inner}</Link>
      ) : (
        inner
      )}
    </div>
  );
}
