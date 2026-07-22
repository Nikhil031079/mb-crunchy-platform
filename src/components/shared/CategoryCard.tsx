import { Link } from "react-router";
import { motion } from "framer-motion";
import { FolderOpen } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { Category, BusinessUnit } from "@/types";

interface CategoryCardProps {
  category: Category;
  businessUnitSlug: string;
  index?: number;
}

export function CategoryCard({
  category,
  businessUnitSlug,
  index = 0,
}: CategoryCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
    >
      <Link
        to={`/${businessUnitSlug}/${category.slug}`}
        className="group block"
      >
        <Card
          className={cn(
            "overflow-hidden transition-all duration-300 hover:shadow-md",
            "hover:border-accent/20"
          )}
        >
          {category.coverImage || category.images?.[0] ? (
            <div className="aspect-[4/3] overflow-hidden bg-secondary">
              <img
                src={category.coverImage || category.images[0]}
                alt={category.name}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="aspect-[4/3] bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center">
              <FolderOpen className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}

          <CardContent className="p-4">
            <h3 className="font-medium text-sm group-hover:text-accent transition-colors">
              {category.name}
            </h3>
            {category.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {category.description}
              </p>
            )}
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

export function CategoryCardSkeleton() {
  return (
    <Card>
      <div className="aspect-[4/3] bg-secondary animate-pulse" />
      <CardContent className="p-4">
        <div className="h-4 w-28 bg-secondary rounded animate-pulse" />
        <div className="h-3 w-36 bg-secondary rounded animate-pulse mt-2" />
      </CardContent>
    </Card>
  );
}
