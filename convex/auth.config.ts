import type { AuthConfig } from "convex/server";

const siteUrl = process.env.CONVEX_SITE_URL ?? "http://localhost:5173";

const vlyIssuer = process.env.VLY_CONVEX_AUTH_ISSUER;

export default {
  providers: [
    {
      domain: siteUrl,
      applicationID: "convex",
    },
    ...(vlyIssuer && vlyIssuer !== siteUrl
      ? [
          {
            type: "customJwt" as const,
            issuer: vlyIssuer,
            jwks: `${vlyIssuer}/api/web/.well-known/jwks.json`,
            applicationID: "convex",
            algorithm: "RS256",
          },
        ]
      : []),
  ],
} satisfies AuthConfig;
