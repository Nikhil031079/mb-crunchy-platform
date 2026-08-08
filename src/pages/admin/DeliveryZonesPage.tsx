import { useEffect, useState } from "react";
import { AlertCircle, MapPin, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
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

interface DeliveryZoneRecord {
  id: string;
  businessUnitId: string;
  name: string;
  radius: number;
  charge: number;
  minOrder?: number;
  freeDeliveryThreshold?: number;
  estimatedMinutes?: number;
  status: "active" | "inactive";
}

interface DeliveryZoneFormValues {
  name: string;
  radius: string;
  charge: string;
  minOrder: string;
  freeDeliveryThreshold: string;
  estimatedMinutes: string;
  status: "active" | "inactive";
}

const EMPTY_FORM: DeliveryZoneFormValues = {
  name: "",
  radius: "",
  charge: "",
  minOrder: "",
  freeDeliveryThreshold: "",
  estimatedMinutes: "",
  status: "active",
};

const toFormValues = (zone?: DeliveryZoneRecord): DeliveryZoneFormValues =>
  zone
    ? {
        name: zone.name,
        radius: String(zone.radius ?? ""),
        charge: String(zone.charge ?? ""),
        minOrder: zone.minOrder != null ? String(zone.minOrder) : "",
        freeDeliveryThreshold: zone.freeDeliveryThreshold != null ? String(zone.freeDeliveryThreshold) : "",
        estimatedMinutes: zone.estimatedMinutes != null ? String(zone.estimatedMinutes) : "",
        status: zone.status,
      }
    : EMPTY_FORM;

const fromConvex = (doc: Doc<"deliveryZones">): DeliveryZoneRecord => ({
  id: doc._id,
  businessUnitId: doc.businessUnitId,
  name: doc.name,
  radius: doc.radius,
  charge: doc.charge,
  minOrder: doc.minOrder,
  freeDeliveryThreshold: doc.freeDeliveryThreshold,
  estimatedMinutes: doc.estimatedMinutes,
  status: doc.status,
});

// ============================================================================
// Delivery Zone Form Dialog
// ============================================================================

interface DeliveryZoneFormDialogProps {
  open: boolean;
  zone?: DeliveryZoneRecord;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DeliveryZoneFormValues) => void;
}

function DeliveryZoneFormDialog({ open, zone, onOpenChange, onSubmit }: DeliveryZoneFormDialogProps) {
  const [values, setValues] = useState<DeliveryZoneFormValues>(() => toFormValues(zone));
  const dialogKey = `${zone?.id ?? "new"}-${open ? "open" : "closed"}`;
  const isEditing = Boolean(zone);

  const update = <K extends keyof DeliveryZoneFormValues>(key: K, value: DeliveryZoneFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      ...values,
      name: values.name.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={dialogKey} className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit delivery zone" : "Create delivery zone"}</DialogTitle>
          <DialogDescription>
            Delivery zones define coverage, charges, and minimum orders for delivery orders.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="dz-name">Name</Label>
            <Input id="dz-name" value={values.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Local Delivery" required autoFocus />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="dz-charge">Delivery fee (₹)</Label>
              <Input id="dz-charge" type="number" min="0" step="0.01" value={values.charge} onChange={(event) => update("charge", event.target.value)} placeholder="e.g. 30" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dz-radius">Radius (km)</Label>
              <Input id="dz-radius" type="number" min="0" step="0.1" value={values.radius} onChange={(event) => update("radius", event.target.value)} placeholder="e.g. 5" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dz-min-order">Minimum order (₹)</Label>
              <Input id="dz-min-order" type="number" min="0" step="0.01" value={values.minOrder} onChange={(event) => update("minOrder", event.target.value)} placeholder="e.g. 99" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dz-free-threshold">Free delivery above (₹)</Label>
              <Input id="dz-free-threshold" type="number" min="0" step="0.01" value={values.freeDeliveryThreshold} onChange={(event) => update("freeDeliveryThreshold", event.target.value)} placeholder="Falls back to store settings" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dz-eta">Estimated time (minutes)</Label>
              <Input id="dz-eta" type="number" min="1" value={values.estimatedMinutes} onChange={(event) => update("estimatedMinutes", event.target.value)} placeholder="e.g. 35" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dz-status">Status</Label>
              <Select value={values.status} onValueChange={(value) => update("status", value as "active" | "inactive")}>
                <SelectTrigger id="dz-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{isEditing ? "Save changes" : "Create delivery zone"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function DeliveryZonesPage() {
  const { getSessionToken } = useAdminAuth();
  const allBUs = useQuery(api.businessUnits.getAll);
  const [selectedBuId, setSelectedBuId] = useState<string | null>(null);
  const zones = useQuery(
    api.deliveryZones.getByBusinessUnit,
    selectedBuId ? { businessUnitId: selectedBuId as Id<"businessUnits"> } : "skip",
  );
  const createZone = useMutation(api.deliveryZones.create);
  const updateZone = useMutation(api.deliveryZones.update);
  const softDeleteZone = useMutation(api.deliveryZones.softDelete);

  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZoneRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<DeliveryZoneRecord | undefined>(undefined);
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

  const openCreate = () => {
    setEditingZone(undefined);
    setFormOpen(true);
  };

  const openEdit = (zone: DeliveryZoneRecord) => {
    setEditingZone(zone);
    setFormOpen(true);
  };

  const saveZone = async (values: DeliveryZoneFormValues) => {
    if (!selectedBuId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: values.name,
        radius: Number(values.radius),
        charge: Number(values.charge),
        minOrder: values.minOrder ? Number(values.minOrder) : undefined,
        freeDeliveryThreshold: values.freeDeliveryThreshold ? Number(values.freeDeliveryThreshold) : undefined,
        estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : undefined,
        status: values.status,
      };
      if (editingZone) {
        await updateZone({ id: editingZone.id as Id<"deliveryZones">, ...payload, sessionToken: getSessionToken()! });
      } else {
        await createZone({ businessUnitId: selectedBuId as Id<"businessUnits">, ...payload, sessionToken: getSessionToken()! });
      }
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save delivery zone");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await softDeleteZone({ id: deleteTarget.id as Id<"deliveryZones">, sessionToken: getSessionToken()! });
      setDeleteTarget(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete delivery zone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Delivery Zones"
        description="Define delivery coverage, fees, minimum orders, and estimated times per business unit."
      >
        <Button size="sm" onClick={openCreate} disabled={!selectedBuId}>
          <Plus className="mr-1.5 size-4" />
          Add delivery zone
        </Button>
      </PageHeader>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not save delivery zone</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {error}
            <Button size="sm" variant="outline" onClick={() => setError(null)}>
              <RefreshCw className="size-3.5" /> Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-4 grid gap-2 sm:max-w-xs">
        <Label htmlFor="dz-business-unit">Business Unit</Label>
        <Select value={selectedBuId ?? undefined} onValueChange={(value) => setSelectedBuId(value)}>
          <SelectTrigger id="dz-business-unit">
            <SelectValue placeholder="Select a business unit" />
          </SelectTrigger>
          <SelectContent>
            {businessUnits.map((bu) => (
              <SelectItem key={bu._id} value={bu._id}>
                {bu.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedBuId ? (
        <EmptyState icon={MapPin} title="Select a business unit" description="Choose a business unit to view its delivery zones." />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading delivery zones...</div>
      ) : zoneRecords.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No delivery zones"
          description={`No delivery zones configured for ${selectedBuName}. Add one to enable delivery orders.`}
          action={{ label: "Create delivery zone", onClick: openCreate }}
        />
      ) : (
        <section className="overflow-hidden rounded-xl border" aria-label="Delivery zone management">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Delivery fee</TableHead>
                <TableHead>Min order</TableHead>
                <TableHead>Free delivery above</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Radius</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zoneRecords.map((zone) => (
                <TableRow key={zone.id}>
                  <TableCell className="font-medium">{zone.name}</TableCell>
                  <TableCell>₹{zone.charge.toFixed(2)}</TableCell>
                  <TableCell>{zone.minOrder != null ? `₹${zone.minOrder.toFixed(2)}` : "—"}</TableCell>
                  <TableCell>{zone.freeDeliveryThreshold != null ? `₹${zone.freeDeliveryThreshold.toFixed(2)}` : "Store default"}</TableCell>
                  <TableCell>{zone.estimatedMinutes ? `${zone.estimatedMinutes} min` : "—"}</TableCell>
                  <TableCell>{zone.radius ? `${zone.radius} km` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={zone.status === "active" ? "default" : "secondary"}>
                      {zone.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(zone)}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(zone)}>
                        <Trash2 className="size-3.5 text-destructive" /> Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <DeliveryZoneFormDialog
        open={formOpen}
        zone={editingZone}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingZone(undefined);
        }}
        onSubmit={saveZone}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete delivery zone</DialogTitle>
            <DialogDescription>
              Delete "{deleteTarget?.name}"? This removes it from {selectedBuName}. Customers will no longer be offered this zone for delivery.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(undefined)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={saving}>
              Delete zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
