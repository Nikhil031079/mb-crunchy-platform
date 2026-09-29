import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Settings } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import type { Id } from "@convex/_generated/dataModel";

export default function ShippingConfigPage() {
  const { getSessionToken } = useAdminAuth();
  const allBUs = useQuery(api.businessUnits.getAll);
  const [selectedBuId, setSelectedBuId] = useState<string | null>(null);
  const config = useQuery(
    api.shippingConfig.getByBusinessUnit,
    selectedBuId ? { businessUnitId: selectedBuId as Id<"businessUnits"> } : "skip",
  );
  const createConfig = useMutation(api.shippingConfig.create);
  const updateConfig = useMutation(api.shippingConfig.update);

  const [minimumBillableWeight, setMinimumBillableWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const businessUnits = (allBUs ?? []).filter((bu) => !bu.deletedAt);

  useEffect(() => {
    if (!selectedBuId && businessUnits.length > 0) {
      setSelectedBuId(businessUnits[0]._id);
    }
  }, [businessUnits, selectedBuId]);

  useEffect(() => {
    if (config) {
      setMinimumBillableWeight(String(config.minimumBillableWeightGrams));
    } else {
      setMinimumBillableWeight("500");
    }
  }, [config]);

  const handleSave = async () => {
    if (!selectedBuId) return;
    setSaving(true);
    setError(null);
    try {
      const weight = Number(minimumBillableWeight);
      if (!weight || weight <= 0) {
        throw new Error("Minimum billable weight must be greater than 0.");
      }
      if (config) {
        await updateConfig({
          sessionToken: getSessionToken()!,
          businessUnitId: selectedBuId as Id<"businessUnits">,
          minimumBillableWeightGrams: weight,
        });
      } else {
        await createConfig({
          sessionToken: getSessionToken()!,
          businessUnitId: selectedBuId as Id<"businessUnits">,
          minimumBillableWeightGrams: weight,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Shipping Settings" description="Global shipping settings per business unit." />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {error}
            <Button size="sm" variant="outline" onClick={() => setError(null)}><RefreshCw className="size-3.5" /> Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-4 grid gap-2 sm:max-w-xs">
        <Label>Business Unit</Label>
        <Select value={selectedBuId ?? undefined} onValueChange={setSelectedBuId}>
          <SelectTrigger><SelectValue placeholder="Select a business unit" /></SelectTrigger>
          <SelectContent>
            {businessUnits.map((bu) => <SelectItem key={bu._id} value={bu._id}>{bu.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!selectedBuId ? (
        <EmptyState icon={Settings} title="Select a business unit" description="Choose a business unit to configure shipping settings." />
      ) : (
        <section className="rounded-xl border p-6 max-w-lg">
          <h3 className="text-sm font-semibold mb-4">Weight Configuration</h3>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="min-billable">Minimum Billable Weight (grams)</Label>
              <Input
                id="min-billable"
                type="number"
                min="1"
                value={minimumBillableWeight}
                onChange={(e) => setMinimumBillableWeight(e.target.value)}
                placeholder="e.g. 500"
              />
              <p className="text-xs text-muted-foreground">
                Orders with total product weight below this value will be billed at this minimum weight.
              </p>
              {/* 12D: static explainer only — no behavior change. */}
              <p className="text-xs text-muted-foreground">
                Coverage at a glance lives on the Shipping Rates page (active slab range, overlaps, gaps).
              </p>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-fit">
              {saving ? "Saving..." : config ? "Update configuration" : "Create configuration"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
