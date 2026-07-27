import { motion } from "framer-motion";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateClassNames {
  icon?: string;
  iconSvg?: string;
  title?: string;
  description?: string;
  action?: string;
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?:
    | React.ReactNode
    | {
        label: string;
        onClick: () => void;
      };
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  disableMotion?: boolean;
  classNames?: EmptyStateClassNames;
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
  className,
  disableMotion = false,
  classNames,
}: EmptyStateProps) {
  const IconComponent = Icon || Inbox;
  const isActionObject =
    action != null &&
    typeof action === "object" &&
    "label" in action &&
    "onClick" in action;

  const wrapperClassName = cn(
    "flex flex-col items-center justify-center py-16 px-4 text-center",
    className
  );

  const content = (
    <>
      <div
        className={
          classNames?.icon ??
          "mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary"
        }
      >
        <IconComponent
          aria-hidden="true"
          className={classNames?.iconSvg ?? "h-7 w-7 text-muted-foreground"}
        />
      </div>
      <h3 className={classNames?.title ?? "text-base font-semibold mb-1"}>
        {title}
      </h3>
      {description && (
        <p
          className={
            classNames?.description ??
            "text-sm text-muted-foreground max-w-sm mb-6"
          }
        >
          {description}
        </p>
      )}
      {action &&
        (isActionObject ? (
          <Button
            onClick={action.onClick}
            size="sm"
            className={classNames?.action}
          >
            {action.label}
          </Button>
        ) : (
          <div className={classNames?.action}>{action}</div>
        ))}
    </>
  );

  if (disableMotion) {
    return (
      <div className={wrapperClassName}>
        {content}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={wrapperClassName}
    >
      {content}
    </motion.div>
  );
}
