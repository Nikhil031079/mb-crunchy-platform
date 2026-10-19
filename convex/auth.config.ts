import type { AuthConfig } from "convex/server";

const siteUrl = process.env.CONVEX_SITE_URL ?? "http://localhost:5173";

export default {
  providers: [
    {
      domain: siteUrl,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
