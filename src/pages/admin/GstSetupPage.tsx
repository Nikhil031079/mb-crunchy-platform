import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { validateGstRate, validateHsn } from "@convex/utils/businessProfile";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAdminAuth } from "@/hooks/use-admin-auth";

type Edit = { hsn?: string; rate?: string };
type Filter = "all" | "missing_rate" | "missing_hsn";

const CHUNK = 200;

export default function GstSetupPage() {
  const { getSessionToken } = useAdminAuth();
  const sessionToken = getSessionToken();
  const items = useQuery(api.taxSetup.listItems, sessionToken ? { sessionToken } : "skip");
  const businessUnits = useQuery(api.businessUnits.getAll);
  const setTaxInfo = useMutation(api.taxSetup.setTaxInfo);

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [filter, setFilter] = useState<Filter>("missing_rate");
  const [buFilter, setBuFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [bulkRate, setBulkRate] = useState("");
  const [saving, setSaving] = useState(false);

  const buName = useMemo(
    () => new Map((businessUnits ?? []).map((bu) => [bu._id as string, bu.name])),
    [businessUnits],
  );

  const valueOf = (id: string, field: "hsn" | "rate", saved: string) => edits[id]?.[field] ?? saved;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (items ?? [])
      .filter((item) => buFilter === "all" || item.businessUnitId === buFilter)
      .filter((item) => !term || item.name.toLowerCase().includes(term))
      .filter((item) => {
        const rate = edits[item._id]?.rate ?? (item.gstRatePercent?.toString() ?? "");
        const hsn = edits[item._id]?.hsn ?? (item.hsnCode ?? "");
        if (filter === "missing_rate") return rate.trim() === "";
        if (filter === "missing_hsn") return hsn.trim() === "";
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, edits, filter, buFilter, search]);

  const totalMissingRate = (items ?? []).filter((i) => i.gstRatePercent === undefined).length;
  const dirtyIds = Object.keys(edits).filter((id) => {
    const item = items?.find((i) => i._id === id);
    if (!item) return false;
    const e = edits[id]!;
    const hsnChanged = e.hsn !== undefined && e.hsn !== (item.hsnCode ?? "");
    const rateChanged = e.rate !== undefined && e.rate !== (item.gstRatePercent?.toString() ?? "");
    return hsnChanged || rateChanged;
  });

  const setEdit = (id: string, field: "hsn" | "rate", value: string) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const applyBulkRate = () => {
    const parsed = Number(bulkRate);
    const check = validateGstRate(parsed);
    if (bulkRate.trim() === "" || !check.ok) {
      toast.error(check.ok ? "Enter a GST rate first" : check.error);
      return;
    }
    setEdits((prev) => {
      const next = { ...prev };
      for (const row of rows) next[row._id] = { ...next[row._id], rate: String(check.value) };
      return next;
    });
    toast.success(`Rate ${check.value}% applied to ${rows.length} item(s). Review, then save.`);
  };

  const handleSave = async () => {
    if (!sessionToken || dirtyIds.length === 0) return;

    const updates: Array<{
      id: Id<"catalogItems">;
      hsnCode?: string | null;
      gstRatePercent?: number | null;
    }> = [];

    for (const id of dirtyIds) {
      const item = items!.find((i) => i._id === id)!;
      const e = edits[id]!;
      const update: (typeof updates)[number] = { id: id as Id<"catalogItems"> };

      if (e.hsn !== undefined && e.hsn !== (item.hsnCode ?? "")) {
        if (e.hsn.trim() === "") update.hsnCode = null;
        else {
          const result = validateHsn(e.hsn);
          if (!result.ok) return void toast.error(`${item.name}: ${result.error}`);
          update.hsnCode = result.value;
        }
      }
      if (e.rate !== undefined && e.rate !== (item.gstRatePercent?.toString() ?? "")) {
        if (e.rate.trim() === "") update.gstRatePercent = null;
        else {
          const result = validateGstRate(Number(e.rate));
          if (!result.ok) return void toast.error(`${item.name}: ${result.error}`);
          update.gstRatePercent = result.value;
        }
      }
      updates.push(update);
    }

    setSaving(true);
    try {
      for (let i = 0; i < updates.length; i += CHUNK) {
        await setTaxInfo({ sessionToken, updates: updates.slice(i, i + CHUNK) });
      }
      setEdits({});
      toast.success(`Saved ${updates.length} item(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="GST Setup"
        description="Set the HSN code and GST rate for everything you sell. Prices are treated as GST-inclusive. Ask your accountant to confirm the rates."
      >
        <Button onClick={handleSave} disabled={saving || dirtyIds.length === 0}>
          {saving ? "Saving..." : `Save ${dirtyIds.length || ""} change${dirtyIds.length === 1 ? "" : "s"}`.trim()}
        </Button>
      </PageHeader>

      {items && totalMissingRate > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {totalMissingRate} item(s) have no GST rate. Once your GSTIN is added, orders containing these items cannot
          be invoiced until a rate is set.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="gst-search">Search</Label>
          <Input id="gst-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item name" />
        </div>
        <div className="grid gap-1.5">
          <Label>Business unit</Label>
          <Select value={buFilter} onValueChange={setBuFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(businessUnits ?? []).map((bu) => (
                <SelectItem key={bu._id} value={bu._id}>{bu.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Show</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="missing_rate">Missing GST rate</SelectItem>
              <SelectItem value="missing_hsn">Missing HSN</SelectItem>
              <SelectItem value="all">Everything</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        <div className="grid gap-1.5">
          <Label htmlFor="bulk-rate">Set one GST % for all {rows.length} item(s) shown</Label>
          <Input
            id="bulk-rate"
            type="number"
            min="0"
            max="40"
            step="0.25"
            value={bulkRate}
            onChange={(e) => setBulkRate(e.target.value)}
            placeholder="e.g. 5"
            className="w-40"
          />
        </div>
        <Button type="button" variant="outline" onClick={applyBulkRate} disabled={rows.length === 0}>
          Apply to shown
        </Button>
      </div>

      {items === undefined ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing to show" description="No items match this filter." />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">Item</th>
                <th className="p-3 font-medium">Unit</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Price</th>
                <th className="p-3 font-medium">HSN (4/6/8 digits)</th>
                <th className="p-3 font-medium">GST %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const rateValue = valueOf(item._id, "rate", item.gstRatePercent?.toString() ?? "");
                const dirty = dirtyIds.includes(item._id);
                return (
                  <tr key={item._id} className={dirty ? "border-t bg-amber-50/60" : "border-t"}>
                    <td className="p-3 font-medium">
                      {item.name}
                      {item.status !== "active" && <Badge variant="outline" className="ml-2">{item.status}</Badge>}
                    </td>
                    <td className="p-3 text-muted-foreground">{buName.get(item.businessUnitId) ?? "-"}</td>
                    <td className="p-3 text-muted-foreground">{item.itemType}</td>
                    <td className="p-3">₹{item.price}</td>
                    <td className="p-3">
                      <Input
                        value={valueOf(item._id, "hsn", item.hsnCode ?? "")}
                        onChange={(e) => setEdit(item._id, "hsn", e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                        inputMode="numeric"
                        placeholder="e.g. 0409"
                        className="w-32 font-mono"
                        aria-label={`HSN for ${item.name}`}
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        min="0"
                        max="40"
                        step="0.25"
                        value={rateValue}
                        onChange={(e) => setEdit(item._id, "rate", e.target.value)}
                        placeholder="required"
                        className="w-28"
                        aria-label={`GST rate for ${item.name}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
