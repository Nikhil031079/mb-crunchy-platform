import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { adminButtonVariants } from "./variants";

type AdminButtonProps = React.ComponentProps<"button"> & { size?: "sm" | "default" | "lg" | "icon" };

function createAdminButton(variant: "primary" | "secondary" | "danger" | "ghost") {
  return function AdminButton({ className, size = "default", type = "button", ...props }: AdminButtonProps) {
    return <button type={type} className={cn(adminButtonVariants({ variant, size }), className)} {...props} />;
  };
}

export const PrimaryButton = createAdminButton("primary");
export const SecondaryButton = createAdminButton("secondary");
export const DangerButton = createAdminButton("danger");
export const GhostButton = createAdminButton("ghost");

export function IconButton({ className, "aria-label": ariaLabel, ...props }: Omit<AdminButtonProps, "size">) {
  return <GhostButton size="icon" className={className} aria-label={ariaLabel} {...props} />;
}

interface LoadingButtonProps extends AdminButtonProps { loading?: boolean; loadingLabel?: string; }

export function LoadingButton({ children, loading = false, loadingLabel = "Loading", disabled, ...props }: LoadingButtonProps) {
  return <PrimaryButton disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}<span>{loading ? loadingLabel : children}</span></PrimaryButton>;
}
