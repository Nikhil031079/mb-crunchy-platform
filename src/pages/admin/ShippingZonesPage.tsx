import { useEffect, useState } from "react";
import { AlertCircle, Pencil, Plus, RefreshCw, Trash2, MapPin } from "lucide-react";
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
import { useAdminAuth } from "@/hooks/use-admin-auth";
import type { Doc, Id } from "@convex/_generated/dataModel";

interface ZoneRecord {
  id: string;
  businessUnitId: string;
  name: string;
  code?: string;
  status: "active" | "inactive";
}

interface ZoneFormValues {
  name: string;
  code: string;
  status: "active" | "inactive";
}

const EMPTY_FORM: ZoneFormValues = { name: "", code: "", status: "active" };

const toFormValues = (record?: ZoneRecord): ZoneFormValues =>
  record
    ? { name: record.name, code: record.code ?? "", status: record.status }
    : EMPTY_FORM;

const fromConvex = (doc: Doc<"shippingZones">): ZoneRecord => ({
  id: doc._id,
  businessUnitId: doc.businessUnitId,
  name: doc.name,
  code: doc.code,
  status: doc.status,
});

function ZoneFormDialog({
  open,
  record,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  record?: ZoneRecord;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ZoneFormValues) => void;
}) {
  const [values, setValues] = useState<ZoneFormValues>(() => toFormValues(record));
  const isEditing = Boolean(record);

  const update = <K extends keyof ZoneFormValues>(key: K, value: ZoneFormValues[K]) =>
    setValues((c) => ({ ...c, [key]: value }));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit({ ...values, name: values.name.trim(), code: values.code.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit zone" : "Create zone"}</DialogTitle>
          <DialogDescription>Shipping zones group pincodes with similar shipping rates.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="zone-name">Name *</Label>
            <Input id="zone-name" value={values.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Local Mumbai" required autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="zone-code">Code <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="zone-code" value={values.code} onChange={(e) => update("code", e.target.value)} placeholder="e.g. MUM-LOCAL" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="zone-status">Status</Label>
            <Select value={values.status} onValueChange={(v) => update("status", v as "active" | "inactive")}>
              <SelectTrigger id="zone-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{isEditing ? "Save changes" : "Create zone"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ShippingZonesPage() {
  const { getSessionToken } = useAdminAuth();
  const allBUs = useQuery(api.businessUnits.getAll);
  const [selectedBuId, setSelectedBuId] = useState<string | null>(null);
  const zones = useQuery(
    api.shippingZones.getAll,
    selectedBuId ? { businessUnitId: selectedBuId as Id<"businessUnits"> } : "skip",
  );
  const createZone = useMutation(api.shippingZones.create);
  const updateZone = useMutation(api.shippingZones.update);
  const softDeleteZone = useMutation(api.shippingZones.softDelete);

  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ZoneRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ZoneRecord | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const businessUnits = (allBUs ?? []).filter((bu) => !bu.deletedAt);

  useEffect(() => {
    if (!selectedBuId && businessUnits.length > 0) {
      setSelectedBuId(businessUnits[0]._id);
    }
  }, [businessUnits, selectedBuId]);

  const selectedBuName = businessUnits.find((bu) => bu._id === selectedBuId)?.name ?? "";
  const zoneRecords = (zones ?? []).map(fromConvex);
  const isLoading = zones === undefined && Boolean(selectedBuId);

  const saveZone = async (values: ZoneFormValues) => {
    if (!selectedBuId) return;
    setSaving(true);
    setError(null);
    try {
      if (editingRecord) {
        await updateZone({
          sessionToken: getSessionToken()!,
          id: editingRecord.id as Id<"shippingZones">,
          name: values.name,
          code: values.code || undefined,
          status: values.status,
        });
      } else {
        await createZone({
          sessionToken: getSessionToken()!,
          businessUnitId: selectedBuId as Id<"businessUnits">,
          name: values.name,
          code: values.code || undefined,
          status: values.status,
        });
      }
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save zone");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await softDeleteZone({
        sessionToken: getSessionToken()!,
        id: deleteTarget.id as Id<"shippingZones">,
      });
      setDeleteTarget(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete zone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Shipping Zones" description="Configure shipping zones for courier-based delivery per business unit.">
        <Button size="sm" onClick={() => { setEditingRecord(undefined); setFormOpen(true); }} disabled={!selectedBuId}>
          <Plus className="mr-1.5 size-4" />Add zone
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

      {!selectedBuId ? (
        <EmptyState icon={MapPin} title="Select a business unit" description="Choose a business unit to view its shipping zones." />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading zones...</div>
      ) : zoneRecords.length === 0 ? (
        <EmptyState icon={MapPin} title="No shipping zones" description={`No shipping zones configured for ${selectedBuName}.`} action={{ label: "Create zone", onClick: () => { setEditingRecord(undefined); setFormOpen(true); } }} />
      ) : (
        <section className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zoneRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{record.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{record.code || "\u2014"}</TableCell>
                  <TableCell><Badge variant={record.status === "active" ? "default" : "secondary"}>{record.status === "active" ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditingRecord(record); setFormOpen(true); }}><Pencil className="size-3.5" /> Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(record)}><Trash2 className="size-3.5 text-destructive" /> Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <ZoneFormDialog key={editingRecord?.id ?? "new"} open={formOpen} record={editingRecord} onOpenChange={(o) => { setFormOpen(o); if (!o) setEditingRecord(undefined); }} onSubmit={saveZone} />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete shipping zone</DialogTitle>
            <DialogDescription>Delete "{deleteTarget?.name}"? Active pincode mappings and rates must be removed first.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(undefined)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={saving}>Delete zone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
