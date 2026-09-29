import { useEffect, useReducer, useState } from "react";
import { AlertCircle, Pencil, Plus, RefreshCw, Trash2, Truck } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  crudDialogKey,
  crudDialogReducer,
  initialCrudDialogState,
} from "@/components/admin/crudDialogState";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import type { Doc, Id } from "@convex/_generated/dataModel";

interface RateRecord {
  id: string;
  shippingZoneId: string;
  businessUnitId: string;
  name: string;
  minWeightGrams: number;
  maxWeightGrams: number;
  charge: number;
  status: "active" | "inactive";
  zoneName?: string;
}

interface RateFormValues {
  shippingZoneId: string;
  name: string;
  minWeightGrams: string;
  maxWeightGrams: string;
  charge: string;
  status: "active" | "inactive";
}

const EMPTY_FORM: RateFormValues = {
  shippingZoneId: "",
  name: "",
  minWeightGrams: "",
  maxWeightGrams: "",
  charge: "",
  status: "active",
};

const fromConvex = (doc: Doc<"shippingRates">, zoneName?: string): RateRecord => ({
  id: doc._id,
  shippingZoneId: doc.shippingZoneId,
  businessUnitId: doc.businessUnitId,
  name: doc.name,
  minWeightGrams: doc.minWeightGrams,
  maxWeightGrams: doc.maxWeightGrams,
  charge: doc.charge,
  status: doc.status,
  zoneName,
});

export function toRateFormValues(
  record: RateRecord | undefined,
  zones: { _id: string; name: string }[],
): RateFormValues {
  if (record) {
    return {
      shippingZoneId: record.shippingZoneId,
      name: record.name,
      minWeightGrams: String(record.minWeightGrams),
      maxWeightGrams: String(record.maxWeightGrams),
      charge: String(record.charge),
      status: record.status,
    };
  }
  return { ...EMPTY_FORM, shippingZoneId: zones[0]?._id ?? "" };
}

function RateFormDialog({
  open,
  record,
  zones,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  record?: RateRecord;
  zones: { _id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: RateFormValues) => void;
}) {
  const [values, setValues] = useState<RateFormValues>(() =>
    toRateFormValues(record, zones),
  );
  const isEditing = Boolean(record);

  const update = <K extends keyof RateFormValues>(key: K, value: RateFormValues[K]) =>
    setValues((c) => ({ ...c, [key]: value }));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit({ ...values, name: values.name.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit rate" : "Create rate"}</DialogTitle>
          <DialogDescription>Define a fixed charge for a weight slab within a shipping zone.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label>Shipping Zone *</Label>
            <Select value={values.shippingZoneId} onValueChange={(v) => update("shippingZoneId", v)} disabled={isEditing}>
              <SelectTrigger><SelectValue placeholder="Select a zone" /></SelectTrigger>
              <SelectContent>
                {zones.map((z) => <SelectItem key={z._id} value={z._id}>{z.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rate-name">Name *</Label>
            <Input id="rate-name" value={values.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. 0-500g" required autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="rate-min">Min Weight (g) *</Label>
              <Input id="rate-min" type="number" min="0" value={values.minWeightGrams} onChange={(e) => update("minWeightGrams", e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rate-max">Max Weight (g) *</Label>
              <Input id="rate-max" type="number" min="0" value={values.maxWeightGrams} onChange={(e) => update("maxWeightGrams", e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rate-charge">Charge (₹) *</Label>
            <Input id="rate-charge" type="number" min="0" step="0.01" value={values.charge} onChange={(e) => update("charge", e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={values.status} onValueChange={(v) => update("status", v as "active" | "inactive")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{isEditing ? "Save changes" : "Create rate"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ShippingRatesPage() {
  const { getSessionToken } = useAdminAuth();
  const token = getSessionToken();
  const allBUs = useQuery(api.businessUnits.getAll);
  const [selectedBuId, setSelectedBuId] = useState<string | null>(null);
  const zones = useQuery(
    api.shippingZones.getAll,
    selectedBuId ? { businessUnitId: selectedBuId as Id<"businessUnits"> } : "skip",
  );
  const rates = useQuery(
    api.shippingRates.getByBusinessUnit,
    selectedBuId ? { businessUnitId: selectedBuId as Id<"businessUnits"> } : "skip",
  );
  // 12D coverage summary (read-only aggregate; superadmin/admin only).
  const coverage = useQuery(
    api.shippingRates.getCoverage,
    token && selectedBuId
      ? { sessionToken: token, businessUnitId: selectedBuId as Id<"businessUnits"> }
      : "skip",
  );
  const createRate = useMutation(api.shippingRates.create);
  const updateRate = useMutation(api.shippingRates.update);
  const softDeleteRate = useMutation(api.shippingRates.softDelete);

  const [error, setError] = useState<string | null>(null);
  // 13C: dialog lifecycle via shared state machine — every open mounts
  // fresh (record id + open session in key), save success clears selection.
  const [dialog, dispatchDialog] = useReducer(crudDialogReducer, initialCrudDialogState);
  const [deleteTarget, setDeleteTarget] = useState<RateRecord | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const businessUnits = (allBUs ?? []).filter((bu) => !bu.deletedAt);
  const zoneList = (zones ?? []).filter((z) => !z.deletedAt);
  const zoneMap = new Map(zoneList.map((z) => [z._id, z.name]));

  useEffect(() => {
    if (!selectedBuId && businessUnits.length > 0) {
      setSelectedBuId(businessUnits[0]._id);
    }
  }, [businessUnits, selectedBuId]);

  const rateRecords = (rates ?? [])
    .map((doc) => fromConvex(doc, zoneMap.get(doc.shippingZoneId)))
    .sort((a, b) => a.minWeightGrams - b.minWeightGrams);
  const editingRecord = dialog.editingId
    ? rateRecords.find((r) => r.id === dialog.editingId)
    : undefined;

  const isLoading = rates === undefined && Boolean(selectedBuId);

  const saveRate = async (values: RateFormValues) => {
    if (!selectedBuId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        sessionToken: getSessionToken()!,
        name: values.name,
        minWeightGrams: Number(values.minWeightGrams),
        maxWeightGrams: Number(values.maxWeightGrams),
        charge: Number(values.charge),
        status: values.status,
      };
      if (editingRecord) {
        await updateRate({ ...payload, id: editingRecord.id as Id<"shippingRates"> });
      } else {
        await createRate({
          ...payload,
          shippingZoneId: values.shippingZoneId as Id<"shippingZones">,
          businessUnitId: selectedBuId as Id<"businessUnits">,
        });
      }
      dispatchDialog({ type: "saveSuccess" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rate");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await softDeleteRate({ sessionToken: getSessionToken()!, id: deleteTarget.id as Id<"shippingRates"> });
      setDeleteTarget(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rate");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Shipping Rates" description="Configure static weight-slab shipping rates per zone.">
        <Button size="sm" onClick={() => dispatchDialog({ type: "openAdd" })} disabled={!selectedBuId || zoneList.length === 0}>
          <Plus className="mr-1.5 size-4" />Add rate
        </Button>
      </PageHeader>

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

      {/* 12D coverage summary — read-only aggregates; warnings are advisory only. */}
      {coverage && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap gap-2" aria-label="Rate coverage summary">
            <Badge variant="outline">{coverage.total} total rates</Badge>
            <Badge variant="default">{coverage.active} active</Badge>
            <Badge variant="secondary">{coverage.inactive} inactive</Badge>
            {coverage.lowestActiveMin !== null && coverage.highestActiveMax !== null && (
              <Badge variant="outline">
                Active coverage {coverage.lowestActiveMin}g – {coverage.highestActiveMax}g
              </Badge>
            )}
          </div>
          {(coverage.overlaps.length > 0 || coverage.gaps.length > 0) && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Rate coverage warning (display only — nothing was changed)</AlertTitle>
              <AlertDescription>
                {coverage.overlaps.length > 0 && (
                  <p>Overlapping active slabs: {coverage.overlaps.length}. Overlapping slabs make checkout fail closed for affected weights.</p>
                )}
                {coverage.gaps.length > 0 && (
                  <p>Uncovered weight gaps above {coverage.gaps.map((g) => `${g.coveredUpTo}g`).join(", ")}g. Carts in a gap cannot be priced.</p>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {!selectedBuId ? (
        <EmptyState icon={Truck} title="Select a business unit" description="Choose a business unit to view its shipping rates." />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading rates...</div>
      ) : rateRecords.length === 0 ? (
        <EmptyState icon={Truck} title="No shipping rates" description="Create shipping zones first, then add weight-slab rates." action={{ label: "Create rate", onClick: () => dispatchDialog({ type: "openAdd" }) }} />
      ) : (
        <section className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zone</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Weight Range</TableHead>
                <TableHead>Charge</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rateRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{record.zoneName ?? "\u2014"}</TableCell>
                  <TableCell className="font-medium">{record.name}</TableCell>
                  <TableCell className="font-mono text-sm">{record.minWeightGrams}–{record.maxWeightGrams}g</TableCell>
                  <TableCell>₹{record.charge}</TableCell>
                  <TableCell><Badge variant={record.status === "active" ? "default" : "secondary"}>{record.status === "active" ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => dispatchDialog({ type: "openEdit", id: record.id })}><Pencil className="size-3.5" /> Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(record)}><Trash2 className="size-3.5 text-destructive" /> Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <RateFormDialog key={crudDialogKey(dialog)} open={dialog.open} record={editingRecord} zones={zoneList} onOpenChange={(o) => { if (!o) dispatchDialog({ type: "close" }); }} onSubmit={saveRate} />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete shipping rate</DialogTitle>
            <DialogDescription>Delete "{deleteTarget?.name}" ({deleteTarget?.minWeightGrams}–{deleteTarget?.maxWeightGrams}g)?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(undefined)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={saving}>Delete rate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
