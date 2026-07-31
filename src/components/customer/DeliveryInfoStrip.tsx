import { memo } from "react";
import { motion } from "framer-motion";
import { Truck, Salad, ShieldCheck, Star } from "lucide-react";

import { cn } from "@/lib/utils";

// ============================================================================
// Delivery Information Strip
// ============================================================================

interface InfoItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  color: string;
}

const INFO_ITEMS: InfoItem[] = [
  {
    icon: Truck,
    title: "Fast Delivery",
    subtitle: "At your doorstep, in minutes",
    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400",
  },
  {
    icon: Salad,
    title: "Fresh Everyday",
    subtitle: "Prepared fresh, daily",
    color: "text-green-600 bg-green-50 dark:bg-green-950/50 dark:text-green-400",
  },
  {
    icon: ShieldCheck,
    title: "Secure Payments",
    subtitle: "UPI, cards & more",
    color: "text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400",
  },
  {
    icon: Star,
    title: "Premium Quality",
    subtitle: "Quality you can trust",
    color: "text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400",
  },
];

export const DeliveryInfoStrip = memo(function DeliveryInfoStrip() {
  return (
    <section className="border-b border-border/40 bg-background">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {INFO_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
              >
                <div className="group flex items-center gap-3 rounded-xl border border-border/40 bg-card px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/20 hover:shadow-sm">
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110",
                      item.color
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.subtitle}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
});
