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

interface PincodeRecord {
  id: string;
  businessUnitId: string;
  pincode: string;
  city?: string;
  state?: string;
  status: "active" | "inactive";
  deliveryDays?: number;
  shippingZoneId?: string;
  shippingZoneName?: string;
}

interface PincodeFormValues {
  pincode: string;
  city: string;
  state: string;
  status: "active" | "inactive";
  deliveryDays: string;
  shippingZoneId: string;
}

const EMPTY_FORM: PincodeFormValues = {
  pincode: "",
  city: "",
  state: "",
  status: "active",
  deliveryDays: "",
  shippingZoneId: "none",
};

const toFormValues = (record?: PincodeRecord): PincodeFormValues =>
  record
    ? {
        pincode: record.pincode,
        city: record.city ?? "",
        state: record.state ?? "",
        status: record.status,
        deliveryDays: record.deliveryDays != null ? String(record.deliveryDays) : "",
        shippingZoneId: record.shippingZoneId ?? "none",
      }
    : EMPTY_FORM;

const fromConvex = (doc: Doc<"martPincodeServiceability">, zoneName?: string): PincodeRecord => ({
  id: doc._id,
  businessUnitId: doc.businessUnitId,
  pincode: doc.pincode,
  city: doc.city,
  state: doc.state,
  status: doc.status,
  deliveryDays: doc.deliveryDays,
  shippingZoneId: doc.shippingZoneId,
  shippingZoneName: zoneName,
});

// ============================================================================
// Pincode Form Dialog
// ============================================================================

interface PincodeFormDialogProps {
  open: boolean;
  record?: PincodeRecord;
  zones: { _id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PincodeFormValues) => void;
}

function PincodeFormDialog({ open, record, zones, onOpenChange, onSubmit }: PincodeFormDialogProps) {
  const [values, setValues] = useState<PincodeFormValues>(() => toFormValues(record));
  const dialogKey = `${record?.id ?? "new"}-${open ? "open" : "closed"}`;
  const isEditing = Boolean(record);

  const update = <K extends keyof PincodeFormValues>(key: K, value: PincodeFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      ...values,
      pincode: values.pincode.trim(),
      city: values.city.trim(),
      state: values.state.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={dialogKey} className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit pincode" : "Add pincode"}</DialogTitle>
          <DialogDescription>
            Configure serviceable pincodes for courier delivery coverage.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="pin-pincode">Pincode *</Label>
            <Input
              id="pin-pincode"
              value={values.pincode}
              onChange={(e) => update("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit pincode"
              maxLength={6}
              required
              autoFocus
              disabled={isEditing}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pin-city">City / District</Label>
              <Input id="pin-city" value={values.city} onChange={(e) => update("city", e.target.value)} placeholder="e.g. Mumbai" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pin-state">State</Label>
              <Input id="pin-state" value={values.state} onChange={(e) => update("state", e.target.value)} placeholder="e.g. Maharashtra" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pin-delivery-days">Delivery days (est.)</Label>
              <Input id="pin-delivery-days" type="number" min="1" value={values.deliveryDays} onChange={(e) => update("deliveryDays", e.target.value)} placeholder="e.g. 3" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pin-zone">Shipping Zone</Label>
              <Select value={values.shippingZoneId} onValueChange={(v) => update("shippingZoneId", v)}>
                <SelectTrigger id="pin-zone"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {zones.map((z) => <SelectItem key={z._id} value={z._id}>{z.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Required for courier-based delivery.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pin-status">Status</Label>
              <Select value={values.status} onValueChange={(value) => update("status", value as "active" | "inactive")}>
                <SelectTrigger id="pin-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{isEditing ? "Save changes" : "Add pincode"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function MartPincodeServiceabilityPage() {
  const { getSessionToken } = useAdminAuth();
  const allBUs = useQuery(api.businessUnits.getAll);
  const [selectedBuId, setSelectedBuId] = useState<string | null>(null);
  const pincodes = useQuery(
    api.martPincodeServiceability.getByBusinessUnit,
    selectedBuId ? { businessUnitId: selectedBuId as Id<"businessUnits"> } : "skip",
  );
  const zones = useQuery(
    api.shippingZones.getAll,
    selectedBuId ? { businessUnitId: selectedBuId as Id<"businessUnits"> } : "skip",
  );
  const createPincode = useMutation(api.martPincodeServiceability.create);
  const updatePincode = useMutation(api.martPincodeServiceability.update);
  const softDeletePincode = useMutation(api.martPincodeServiceability.softDelete);

  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PincodeRecord | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<PincodeRecord | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const businessUnits = (allBUs ?? []).filter((bu) => !bu.deletedAt);

  useEffect(() => {
    if (!selectedBuId && businessUnits.length > 0) {
      setSelectedBuId(businessUnits[0]._id);
    }
  }, [businessUnits, selectedBuId]);

  const selectedBuName = businessUnits.find((bu) => bu._id === selectedBuId)?.name ?? "";
  const zoneList = (zones ?? []).filter((z) => !z.deletedAt);
  const zoneMap = new Map(zoneList.map((z) => [z._id, z.name]));
  const pincodeRecords = (pincodes ?? []).map((doc) => fromConvex(doc, doc.shippingZoneId ? zoneMap.get(doc.shippingZoneId) : undefined));
  const isLoading = pincodes === undefined && Boolean(selectedBuId);

  const openCreate = () => {
    setEditingRecord(undefined);
    setFormOpen(true);
  };

  const openEdit = (record: PincodeRecord) => {
    setEditingRecord(record);
    setFormOpen(true);
  };

  const savePincode = async (values: PincodeFormValues) => {
    if (!selectedBuId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        pincode: values.pincode,
        city: values.city || undefined,
        state: values.state || undefined,
        status: values.status,
        deliveryDays: values.deliveryDays ? Number(values.deliveryDays) : undefined,
        shippingZoneId: values.shippingZoneId && values.shippingZoneId !== "none"
          ? (values.shippingZoneId as Id<"shippingZones">)
          : undefined,
      };
      if (editingRecord) {
        await updatePincode({
          sessionToken: getSessionToken()!,
          id: editingRecord.id as Id<"martPincodeServiceability">,
          city: payload.city,
          state: payload.state,
          status: payload.status,
          deliveryDays: payload.deliveryDays,
          shippingZoneId: payload.shippingZoneId,
        });
      } else {
        await createPincode({
          sessionToken: getSessionToken()!,
          businessUnitId: selectedBuId as Id<"businessUnits">,
          ...payload,
        });
      }
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pincode");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await softDeletePincode({
        sessionToken: getSessionToken()!,
        id: deleteTarget.id as Id<"martPincodeServiceability">,
      });
      setDeleteTarget(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete pincode");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Serviceable Areas"
        description="Configure serviceable pincodes for courier-based delivery per business unit."
      >
        <Button size="sm" onClick={openCreate} disabled={!selectedBuId}>
          <Plus className="mr-1.5 size-4" />
          Add pincode
        </Button>
      </PageHeader>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="size-4" />
          <AlertTitle>Could not save pincode</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {error}
            <Button size="sm" variant="outline" onClick={() => setError(null)}>
              <RefreshCw className="size-3.5" /> Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-4 grid gap-2 sm:max-w-xs">
        <Label htmlFor="pin-business-unit">Business Unit</Label>
        <Select value={selectedBuId ?? undefined} onValueChange={(value) => setSelectedBuId(value)}>
          <SelectTrigger id="pin-business-unit">
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
        <EmptyState icon={MapPin} title="Select a business unit" description="Choose a business unit to view its serviceable pincodes." />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading pincodes...</div>
      ) : pincodeRecords.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No pincodes configured"
          description={`No serviceable pincodes configured for ${selectedBuName}. Add pincodes to enable courier delivery.`}
          action={{ label: "Add pincode", onClick: openCreate }}
        />
      ) : (
        <section className="overflow-hidden rounded-xl border" aria-label="Pincode serviceability management">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pincode</TableHead>
                <TableHead>City / District</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Shipping Zone</TableHead>
                <TableHead>Delivery Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pincodeRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium font-mono">{record.pincode}</TableCell>
                  <TableCell>{record.city || "\u2014"}</TableCell>
                  <TableCell>{record.state || "\u2014"}</TableCell>
                  <TableCell>
                    {record.shippingZoneName
                      ? <Badge variant="outline">{record.shippingZoneName}</Badge>
                      : <span className="text-muted-foreground">None</span>}
                  </TableCell>
                  <TableCell>{record.deliveryDays ? `${record.deliveryDays} days` : "\u2014"}</TableCell>
                  <TableCell>
                    <Badge variant={record.status === "active" ? "default" : "secondary"}>
                      {record.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(record)}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(record)}>
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

      <PincodeFormDialog
        open={formOpen}
        record={editingRecord}
        zones={zoneList}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingRecord(undefined);
        }}
        onSubmit={savePincode}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete pincode</DialogTitle>
            <DialogDescription>
              Remove pincode {deleteTarget?.pincode} from {selectedBuName}? Customers in this area will no longer be able to receive courier delivery.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(undefined)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={saving}>
              Delete pincode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
