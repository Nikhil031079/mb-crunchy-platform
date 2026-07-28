import { createContext, useContext, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { SITE_NAME } from "@/constants";

import type { ReactNode } from "react";

interface BrandingValues {
  siteName: string;
  logo: string | null;
  favicon: string | null;
  siteDescription: string;
}

const DEFAULTS: BrandingValues = {
  siteName: SITE_NAME,
  logo: null,
  favicon: null,
  siteDescription: "Your premium destination for quality products and services",
};

const BrandingContext = createContext<BrandingValues>(DEFAULTS);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const settings = useQuery(api.settings.getGlobalSettings);

  const branding: BrandingValues = {
    siteName: settings?.siteName || DEFAULTS.siteName,
    logo: settings?.logo || null,
    favicon: settings?.favicon || null,
    siteDescription: settings?.siteDescription || DEFAULTS.siteDescription,
  };

  useEffect(() => {
    if (!branding.favicon) return;
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    const prev = link.href;
    link.href = branding.favicon;
    return () => { link!.href = prev; };
  }, [branding.favicon]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingValues {
  return useContext(BrandingContext);
}
