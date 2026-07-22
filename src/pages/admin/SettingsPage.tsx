import { PageHeader } from "@/components/shared/PageHeader";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure your platform settings"
      />

      <div className="grid gap-6 max-w-2xl">
        <div className="rounded-xl border border-border/60 p-6 space-y-4">
          <h2 className="font-semibold">General Settings</h2>
          <p className="text-sm text-muted-foreground">
            Platform-wide settings will be configured here.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 p-6 space-y-4">
          <h2 className="font-semibold">Business Unit Settings</h2>
          <p className="text-sm text-muted-foreground">
            Per-business-unit settings will be configured here.
          </p>
        </div>
      </div>
    </div>
  );
}
