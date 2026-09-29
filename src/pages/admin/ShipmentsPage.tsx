import { useMemo, useState } from "react";
import { Truck, Package, ExternalLink, Loader2, Search } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@convex/_generated/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { OrderDetailDialog } from "@/components/admin/orders/OrderDetailDialog";
import { enrichOrder } from "@/pages/admin/OrdersPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/utils";
import { cn } from "@/lib/utils";

// ============================================================================
// ShipmentsPage — admin shipment console (11A).
//
// Read model comes entirely from the existing backend:
// - list + tracking events: courier.adminShipmentMonitoring.getShipmentsForAdmin
//   (session-gated, BU/status filters, enriched rows with server labels)
// - order detail: orders.getById (superadmin/admin gated, full document)
// - manual AWB/courier/URL attach: courier.adminShipmentMonitoring
//   .attachShipmentDetails (superadmin/admin gated, validated server-side,
//   record-only — never calls Shiprocket, never changes status/payment)
// Convex reactivity refreshes the list after mutations; no polling.
// ============================================================================

// Display mirror of the canonical backend statuses
// (convex/courier/shipmentStatus.ts). Stored values are never altered here.
const SHIPMENT_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "booked", label: "Booked" },
  { value: "shipped", label: "Shipped" },
  { value: "in_transit", label: "In Transit" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
] as const;

type ShipmentRow = {
  _id: string;
  orderId: string;
  orderNumber: string;
  businessUnitId: string;
  businessUnitName: string;
  provider: string;
  providerShipmentId: string | null;
  shipmentStatus: string;
  shipmentStatusLabel: string;
  courierName: string | null;
  awbNumber: string | null;
  trackingUrl: string | null;
  destinationPincode: string | null;
  destinationCity: string | null;
  createdAt: number;
  updatedAt: number;
  latestEvent: {
    status: string;
    statusLabel: string;
    description: string | null;
    eventTimestamp: number;
  } | null;
  trackingEvents: Array<{
    _id: string;
    status: string;
    statusLabel: string;
    description: string | null;
    location: string | null;
    eventTimestamp: number;
    createdAt: number;
  }>;
};

function statusBadgeVariant(status: string):
  | "default"
  | "secondary"
  | "destructive"
  | "outline" {
  if (status === "delivered") return "default";
  if (status === "failed" || status === "cancelled") return "destructive";
  if (status === "in_transit" || status === "out_for_delivery" || status === "shipped") {
    return "secondary";
  }
  return "outline";
}

export default function ShipmentsPage() {
  const { getSessionToken, admin } = useAdminAuth();
  const token = getSessionToken();
  const canViewOrders =
    admin?.role === "superadmin" || admin?.role === "admin";

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [buFilter, setBuFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [awb, setAwb] = useState("");
  const [courier, setCourier] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);

  // 15B cross-link: open the existing order detail for a shipment row.
  const [orderDialogOrderId, setOrderDialogOrderId] = useState<string | null>(null);
  const orderDetailDoc = useQuery(
    api.orders.getById,
    token && orderDialogOrderId && canViewOrders
      ? { sessionToken: token, orderId: orderDialogOrderId as never }
      : "skip",
  );

  const openOrderDetail = (orderId: string) => {
    if (!canViewOrders) {
      toast.error("Not permitted", {
        description: "Order details require an admin role.",
      });
      return;
    }
    setOrderDialogOrderId(orderId);
  };

  const shipments = useQuery(
    api.courier.adminShipmentMonitoring.getShipmentsForAdmin,
    token
      ? {
          sessionToken: token,
          status: statusFilter !== "all" ? statusFilter : undefined,
          businessUnitId: buFilter !== "all" ? buFilter : undefined,
          limit: 100,
        }
      : "skip",
  ) as ShipmentRow[] | undefined;

  const allBUs = useQuery(api.businessUnits.getAll) as
    | Array<{ _id: string; name: string }>
    | undefined;

  const buMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const bu of allBUs ?? []) map.set(bu._id, bu.name);
    return map;
  }, [allBUs]);

  const orderDialogOrder = orderDetailDoc
    ? enrichOrder(orderDetailDoc, buMap)
    : null;

  const attachDetails = useMutation(
    api.courier.adminShipmentMonitoring.attachShipmentDetails,
  );

  const selected = useMemo(
    () => (shipments ?? []).find((s) => s._id === selectedId) ?? null,
    [shipments, selectedId],
  );

  // Free-text search over order number, AWB, courier, and pincode
  // (preserved from the pre-11A monitoring page).
  const visibleShipments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return shipments ?? [];
    return (shipments ?? []).filter(
      (s) =>
        s.orderNumber.toLowerCase().includes(query) ||
        s.awbNumber?.toLowerCase().includes(query) ||
        s.courierName?.toLowerCase().includes(query) ||
        s.destinationPincode?.includes(query),
    );
  }, [shipments, searchQuery]);

  const orderDetail = useQuery(
    api.orders.getById,
    token && selected
      ? { sessionToken: token, orderId: selected.orderId as never }
      : "skip",
  ) as
    | {
        orderNumber: string;
        orderType: string;
        paymentStatus: string;
        deliveryAddress?: string;
        destinationCity?: string;
        destinationState?: string;
        createdAt: number;
      }
    | null
    | undefined;

  const isLoading = shipments === undefined;

  const closeDetail = () => {
    setSelectedId(null);
    setAwb("");
    setCourier("");
    setTrackingUrl("");
    setAttachError(null);
  };

  const handleAttach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selected) return;
    setAttachError(null);
    if (!awb.trim() && !courier.trim() && !trackingUrl.trim()) {
      setAttachError("Enter an AWB number, courier name, or tracking URL.");
      return;
    }
    setIsAttaching(true);
    try {
      await attachDetails({
        sessionToken: token,
        shipmentId: selected._id as never,
        awbNumber: awb.trim() ? awb.trim() : undefined,
        courierName: courier.trim() ? courier.trim() : undefined,
        trackingUrl: trackingUrl.trim() ? trackingUrl.trim() : undefined,
      });
      toast.success("Shipment details updated");
      setAwb("");
      setCourier("");
      setTrackingUrl("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed";
      setAttachError(message);
      toast.error("Update failed", { description: message });
    } finally {
      setIsAttaching(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shiprocket Shipments"
        description="Courier shipments booked from paid Mart orders. Attaching details updates the record only — it never books or contacts Shiprocket."
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order, AWB, courier, PIN…"
            className="pl-9"
          />
        </div>
        <div className="w-52">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {SHIPMENT_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-52">
          <Select value={buFilter} onValueChange={setBuFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Business unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All business units</SelectItem>
              {(allBUs ?? []).map((bu) => (
                <SelectItem key={bu._id} value={bu._id}>
                  {bu.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-secondary" />
          ))}
        </div>
      ) : !shipments || visibleShipments.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No shipments found"
          description="Shipments appear here after paid Mart delivery orders are booked with the courier. Adjust the search or filters to see more."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Business unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Courier</TableHead>
                <TableHead>AWB</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleShipments.map((s) => (
                <TableRow
                  key={s._id}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(s._id)}
                >
                  <TableCell className="font-mono text-sm font-semibold">
                    <button
                      type="button"
                      className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                      onClick={() => openOrderDetail(s.orderId)}
                      title="View order detail"
                    >
                      {s.orderNumber}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.businessUnitName}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(s.shipmentStatus)}>
                      {s.shipmentStatusLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.courierName ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {s.awbNumber ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.trackingUrl ? "Available" : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(s.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail + attach */}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Shipment {selected?.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Record-only operations. Nothing here books, pays, or contacts Shiprocket.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-6">
              {/* Order */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Order</h3>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <dt className="text-muted-foreground">Order number</dt>
                  <dd className="break-all font-mono font-medium">
                    <button
                      type="button"
                      className="underline decoration-dotted underline-offset-2"
                      onClick={() => openOrderDetail(selected.orderId)}
                      title="View order detail"
                    >
                      {selected.orderNumber}
                    </button>
                  </dd>
                  <dt className="text-muted-foreground">Business unit</dt>
                  <dd>{selected.businessUnitName}</dd>
                  <dt className="text-muted-foreground">Order type</dt>
                  <dd className="capitalize">{orderDetail?.orderType ?? "—"}</dd>
                  <dt className="text-muted-foreground">Payment status</dt>
                  <dd className="capitalize">{orderDetail?.paymentStatus ?? "—"}</dd>
                  <dt className="text-muted-foreground">Ordered at</dt>
                  <dd>{orderDetail ? formatDateTime(orderDetail.createdAt) : "—"}</dd>
                </dl>
              </section>

              {/* Shipment */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Shipment</h3>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="capitalize">{selected.provider}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <Badge variant={statusBadgeVariant(selected.shipmentStatus)}>
                      {selected.shipmentStatusLabel}
                    </Badge>
                  </dd>
                  <dt className="text-muted-foreground">Courier</dt>
                  <dd>{selected.courierName ?? "—"}</dd>
                  <dt className="text-muted-foreground">AWB</dt>
                  <dd className="break-all font-mono">{selected.awbNumber ?? "—"}</dd>
                  <dt className="text-muted-foreground">Tracking URL</dt>
                  <dd>
                    {selected.trackingUrl ? (
                      <a
                        href={selected.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline"
                      >
                        Open tracking
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Provider shipment ID</dt>
                  <dd className="break-all font-mono text-xs">
                    {selected.providerShipmentId ?? "—"}
                  </dd>
                  <dt className="text-muted-foreground">Created / updated</dt>
                  <dd>
                    {formatDateTime(selected.createdAt)} /{" "}
                    {formatDateTime(selected.updatedAt)}
                  </dd>
                </dl>
              </section>

              {/* Address snapshot (shipment record only) */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Destination snapshot</h3>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <dt className="text-muted-foreground">Pincode</dt>
                  <dd>{selected.destinationPincode ?? "—"}</dd>
                  <dt className="text-muted-foreground">City</dt>
                  <dd>{selected.destinationCity ?? "—"}</dd>
                  {orderDetail?.deliveryAddress && (
                    <>
                      <dt className="text-muted-foreground">Delivery address</dt>
                      <dd>{orderDetail.deliveryAddress}</dd>
                    </>
                  )}
                </dl>
              </section>

              {/* Tracking events */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Tracking events ({selected.trackingEvents.length})
                </h3>
                {selected.trackingEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tracking events yet.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {selected.trackingEvents.map((event) => (
                      <li
                        key={event._id}
                        className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium">{event.statusLabel}</p>
                          {event.description && (
                            <p className="text-xs text-muted-foreground">
                              {event.description}
                            </p>
                          )}
                          {event.location && (
                            <p className="text-xs text-muted-foreground">
                              {event.location}
                            </p>
                          )}
                        </div>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(event.eventTimestamp)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* Manual attach */}
              <section className="space-y-3 rounded-xl border p-4">
                <h3 className="text-sm font-semibold">Attach courier details</h3>
                <p className="text-xs text-muted-foreground">
                  Updates this shipment record only. Provide at least one field.
                </p>
                <form onSubmit={handleAttach} className="space-y-3">
                  <div className="grid gap-2">
                    <Label htmlFor="attach-awb">AWB number</Label>
                    <Input
                      id="attach-awb"
                      value={awb}
                      onChange={(e) => setAwb(e.target.value.toUpperCase())}
                      placeholder="e.g. SRTP123456789"
                      className="font-mono"
                      disabled={isAttaching}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="attach-courier">Courier name</Label>
                    <Input
                      id="attach-courier"
                      value={courier}
                      onChange={(e) => setCourier(e.target.value)}
                      placeholder="e.g. Delhivery"
                      disabled={isAttaching}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="attach-url">Tracking URL</Label>
                    <Input
                      id="attach-url"
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      placeholder="https://…"
                      inputMode="url"
                      disabled={isAttaching}
                    />
                  </div>
                  {attachError && (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {attachError}
                    </p>
                  )}
                  <DialogFooter>
                    <Button type="submit" disabled={isAttaching}>
                      {isAttaching && (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      )}
                      Save details
                    </Button>
                  </DialogFooter>
                </form>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 15B cross-link: existing order detail for the selected shipment row. */}
      <OrderDetailDialog
        open={orderDialogOrderId !== null}
        order={orderDialogOrder}
        onOpenChange={(o) => {
          if (!o) setOrderDialogOrderId(null);
        }}
      />
    </div>
  );
}
