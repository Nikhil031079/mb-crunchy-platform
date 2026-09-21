import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Truck, Package, Search, RefreshCw, ExternalLink, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { formatDateTime } from "@/utils";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  booked: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  shipped: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  in_transit: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  out_for_delivery: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  delivered: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function ShipmentsPage() {
  const { getSessionToken } = useAdminAuth();
  const sessionToken = getSessionToken();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const shipments = useQuery(
    api.courier.adminShipmentMonitoring.getShipmentsForAdmin,
    sessionToken
      ? {
          sessionToken,
          status: statusFilter === "all" ? undefined : statusFilter,
          limit: 100,
        }
      : "skip"
  );

  const filteredShipments = useMemo(() => {
    if (!shipments) return [];
    if (!searchQuery) return shipments;

    const query = searchQuery.toLowerCase();
    return shipments.filter(
      (s) =>
        s.orderNumber.toLowerCase().includes(query) ||
        s.awbNumber?.toLowerCase().includes(query) ||
        s.courierName?.toLowerCase().includes(query) ||
        s.destinationPincode?.includes(query)
    );
  }, [shipments, searchQuery]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "cancelled":
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "shipped":
      case "in_transit":
      case "out_for_delivery":
        return <Truck className="h-4 w-4 text-blue-600" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shipment Monitoring"
        description="Monitor courier shipments for Mart delivery orders"
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by order number, AWB, courier, or pincode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="booked">Booked</option>
              <option value="shipped">Shipped</option>
              <option value="in_transit">In Transit</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
              <option value="failed">Failed</option>
            </select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Shipments List */}
      {shipments === undefined ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : filteredShipments.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No Shipments Found"
          description={
            searchQuery || statusFilter !== "all"
              ? "No shipments match your filters."
              : "No shipments have been created yet."
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredShipments.map((shipment) => (
            <Card key={shipment._id}>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: Order & Shipment Info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(shipment.shipmentStatus)}
                      <span className="font-semibold">{shipment.orderNumber}</span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          STATUS_COLORS[shipment.shipmentStatus]
                        )}
                      >
                        {shipment.shipmentStatusLabel}
                      </Badge>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <span>{shipment.businessUnitName}</span>
                      {shipment.destinationPincode && (
                        <span> • Pincode: {shipment.destinationPincode}</span>
                      )}
                    </div>

                    {/* AWB & Courier */}
                    <div className="flex flex-wrap gap-4 text-sm">
                      {shipment.awbNumber && (
                        <div>
                          <span className="text-muted-foreground">AWB: </span>
                          <span className="font-mono">{shipment.awbNumber}</span>
                        </div>
                      )}
                      {shipment.courierName && (
                        <div>
                          <span className="text-muted-foreground">Courier: </span>
                          <span>{shipment.courierName}</span>
                        </div>
                      )}
                      {shipment.providerShipmentId && (
                        <div>
                          <span className="text-muted-foreground">Provider ID: </span>
                          <span className="font-mono">{shipment.providerShipmentId}</span>
                        </div>
                      )}
                    </div>

                    {/* Latest Event */}
                    {shipment.latestEvent && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Latest: </span>
                        <span className="font-medium">{shipment.latestEvent.statusLabel}</span>
                        {shipment.latestEvent.description && (
                          <span className="text-muted-foreground">
                            {" "}
                            — {shipment.latestEvent.description}
                          </span>
                        )}
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({formatDateTime(shipment.latestEvent.eventTimestamp)})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions & Timestamps */}
                  <div className="flex flex-col items-end gap-2 text-sm">
                    <div className="text-muted-foreground">
                      Created: {formatDateTime(shipment.createdAt)}
                    </div>
                    <div className="text-muted-foreground">
                      Updated: {formatDateTime(shipment.updatedAt)}
                    </div>

                    {shipment.trackingUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => window.open(shipment.trackingUrl!, "_blank")}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Track
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tracking Events Timeline */}
                {shipment.trackingEvents.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                      Tracking History
                    </h4>
                    <div className="space-y-2">
                      {shipment.trackingEvents.slice(-5).reverse().map((event) => (
                        <div
                          key={event._id}
                          className="flex items-start gap-2 text-sm"
                        >
                          <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <div>
                            <span className="font-medium">{event.statusLabel}</span>
                            {event.description && (
                              <span className="text-muted-foreground">
                                {" "}
                                — {event.description}
                              </span>
                            )}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {formatDateTime(event.eventTimestamp)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
