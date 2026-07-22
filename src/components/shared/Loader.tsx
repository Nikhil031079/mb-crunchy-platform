import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoaderProps {
  size?: "sm" | "default" | "lg";
  text?: string;
  className?: string;
  fullPage?: boolean;
}

export function Loader({
  size = "default",
  text,
  className,
  fullPage = false,
}: LoaderProps) {
  const sizeMap = {
    sm: "h-4 w-4",
    default: "h-6 w-6",
    lg: "h-8 w-8",
  };

  const content = (
    <div
      className={cn(
        "flex items-center justify-center gap-2 text-muted-foreground",
        className
      )}
    >
      <Loader2 className={cn("animate-spin", sizeMap[size])} />
      {text && <span className="text-sm">{text}</span>}
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
}
