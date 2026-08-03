import { Calendar, Clock, ExternalLink, Image, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminDialog, ArchiveDialog, RestoreDialog } from "@/components/admin/design-system/AdminDialogs";
import { cn } from "@/lib/utils";
import { getCampaignWindowStatus, getContentMarketingSettings } from "@/utils";
import { contentTypeLabels } from "./types";
import type { Banner } from "./types";

interface BannerDialogsProps {
  deleteTarget?: Banner;
  restoreTarget?: Banner;
  previewTarget?: Banner;
  onDeleteOpenChange: (open: boolean) => void;
  onRestoreOpenChange: (open: boolean) => void;
  onPreviewOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  onConfirmRestore: () => void;
}

export function BannerDialogs({ deleteTarget, restoreTarget, previewTarget, onDeleteOpenChange, onRestoreOpenChange, onPreviewOpenChange, onConfirmDelete, onConfirmRestore }: BannerDialogsProps) {
  return (
    <>
      <ArchiveDialog
        open={Boolean(deleteTarget)}
        onOpenChange={onDeleteOpenChange}
        description={deleteTarget ? `Archive "${deleteTarget.title}"? It can be restored later.` : ""}
        onConfirm={onConfirmDelete}
      />
      <RestoreDialog
        open={Boolean(restoreTarget)}
        onOpenChange={onRestoreOpenChange}
        description={restoreTarget ? `Restore "${restoreTarget.title}"?` : ""}
        onConfirm={onConfirmRestore}
      />
      <BannerPreviewDialog
        banner={previewTarget}
        onOpenChange={onPreviewOpenChange}
      />
    </>
  );
}

function BannerPreviewDialog({ banner, onOpenChange }: { banner?: Banner; onOpenChange: (open: boolean) => void }) {
  const settings = getContentMarketingSettings(banner);
  const schedule = banner ? getCampaignWindowStatus(banner.startDate, banner.endDate) : "none";
  const scheduleColor: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    scheduled: "bg-blue-500/10 text-blue-600 border-blue-200",
    expired: "bg-red-500/10 text-red-600 border-red-200",
    none: "bg-gray-500/10 text-gray-600 border-gray-200",
  };
  return (
    <AdminDialog
      open={Boolean(banner)}
      onOpenChange={onOpenChange}
      title={banner ? `Preview: ${banner.title}` : "Preview"}
      description={banner ? "This is how the banner appears on the homepage." : ""}
      footer={<Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>}
    >
      {banner && (
        <div className="grid gap-4">
          {banner.imageUrl || settings.mobileImage ? (
            <div className="relative aspect-[16/6] w-full overflow-hidden rounded-lg bg-secondary">
              <img src={banner.imageUrl ?? settings.mobileImage} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex aspect-[16/6] w-full items-center justify-center rounded-lg bg-secondary">
              <Image className="h-8 w-8 text-muted-foreground/40" />
            </div>
          )}
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs">{contentTypeLabels[banner.contentType]}</Badge>
              <Badge variant="outline" className={cn("text-xs capitalize", scheduleColor[schedule])}>{schedule}</Badge>
              <Badge variant="outline" className="text-xs capitalize">{banner.status}</Badge>
            </div>
            <h3 className="text-lg font-semibold">{banner.title}</h3>
            {banner.subtitle && <p className="text-sm text-muted-foreground">{banner.subtitle}</p>}
            {banner.body && <p className="text-sm text-muted-foreground">{banner.body}</p>}
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-4" />
              <span>{banner.businessUnitName ?? "Global (all stores)"}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="size-4" />
              <span>{banner.startDate ? new Date(banner.startDate).toLocaleDateString() : "No start"} → {banner.endDate ? new Date(banner.endDate).toLocaleDateString() : "no end"}</span>
            </div>
            {banner.buttonText && (
              <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                <ExternalLink className="size-4" />
                <span>
                  <span className="font-medium text-foreground">{banner.buttonText}</span> → {banner.buttonLink ?? "/"}
                </span>
              </div>
            )}
            {settings.exclusive && (
              <div className="flex items-center gap-2 text-amber-600 sm:col-span-2">
                <Clock className="size-4" />
                <span>Exclusive — no other hero may overlap this schedule.</span>
              </div>
            )}
          </dl>
        </div>
      )}
    </AdminDialog>
  );
}
