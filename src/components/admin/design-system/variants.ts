import { cva } from "class-variance-authority";

export const adminButtonVariants = cva("inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", {
  variants: {
    variant: {
      primary: "bg-primary text-primary-foreground hover:bg-primary/90",
      secondary: "border bg-background text-foreground shadow-xs hover:bg-accent",
      danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      ghost: "hover:bg-accent hover:text-accent-foreground",
    },
    size: { sm: "h-8 px-3", default: "h-9 px-4", lg: "h-10 px-6", icon: "size-9" },
  },
  defaultVariants: { variant: "primary", size: "default" },
});

export const adminBadgeVariants = cva("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      success: "border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-400",
      warning: "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-400",
      danger: "border-red-200 bg-red-500/10 text-red-700 dark:border-red-900 dark:text-red-400",
      neutral: "border-border bg-muted text-muted-foreground",
      archived: "border-slate-200 bg-slate-500/10 text-slate-700 dark:border-slate-800 dark:text-slate-400",
    },
  },
  defaultVariants: { tone: "neutral" },
});
