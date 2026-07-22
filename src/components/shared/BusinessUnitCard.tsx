import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, Store } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BUSINESS_UNIT_ROUTE } from "@/constants";

import type { BusinessUnit } from "@/types";

interface BusinessUnitCardProps {
  businessUnit: BusinessUnit;
  index?: number;
}

export function BusinessUnitCard({ businessUnit, index = 0 }: BusinessUnitCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Link
        to={BUSINESS_UNIT_ROUTE(businessUnit.slug)}
        className="group block"
      >
        <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-accent/30">
          {/* Banner Image */}
          {businessUnit.banner ? (
            <div className="aspect-[3/1] overflow-hidden bg-secondary">
              <img
                src={businessUnit.banner}
                alt={businessUnit.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="aspect-[3/1] bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center">
              <Store className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}

          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Logo */}
                {businessUnit.logo ? (
                  <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden border">
                    <img
                      src={businessUnit.logo}
                      alt={businessUnit.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: businessUnit.themeColor || "#000" }}
                  >
                    <Store className="h-5 w-5 text-white" />
                  </div>
                )}

                <div className="min-w-0">
                  <h3 className="font-semibold leading-tight group-hover:text-accent transition-colors">
                    {businessUnit.name}
                  </h3>
                  {businessUnit.description && (
                    <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                      {businessUnit.description}
                    </p>
                  )}
                </div>
              </div>

              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

interface BusinessUnitCardSkeletonProps {
  compact?: boolean;
}

export function BusinessUnitCardSkeleton({ compact }: BusinessUnitCardSkeletonProps) {
  if (compact) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-secondary animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="h-4 w-24 bg-secondary rounded animate-pulse" />
              <div className="h-3 w-32 bg-secondary rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div className="aspect-[3/1] bg-secondary animate-pulse" />
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-secondary animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-32 bg-secondary rounded animate-pulse" />
            <div className="h-3 w-48 bg-secondary rounded animate-pulse" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
