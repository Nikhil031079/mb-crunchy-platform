import { useState } from "react";
import { useQuery } from "convex/react";
import { Truck, CheckCircle2, XCircle, AlertTriangle, Package, ExternalLink } from "lucide-react";

import { api } from "@convex/_generated/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import type { Id } from "@convex/_generated/dataModel";

export default function ShiprocketPage() {
  const { sessionToken } = useAdminAuth();

  // Fetch all business units to find Mart
  const businessUnits = useQuery(api.businessUnits.getAll) as
    | { _id: string; name: string; slug: string; serviceabilityMode?: string }[]
    | undefined;

  // Find the Mart business unit
  const martBU = businessUnits?.find((bu) => bu.serviceabilityMode === "pincode_region");

  // Fetch shipments for Mart BU
  const shipments = useQuery(
    api.shipments.getByBusinessUnit,
    martBU ? { businessUnitId: martBU._id as Id<"businessUnits"> } : "skip",
  ) as
    | {
        _id: string;
        orderId: string;
        awbNumber?: string;
        status: string;
        courierProvider?: string;
        courierMetadata?: string;
        createdAt: number;
      }[]
    | undefined;

  // Parse courier metadata for booking status
  const parseMetadata = (metadata?: string) => {
    if (!metadata) return null;
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  };

  // Calculate statistics
  const stats = {
    total: shipments?.length ?? 0,
    booked: shipments?.filter((s) => {
      const meta = parseMetadata(s.courierMetadata);
      return meta?.bookingStatus === "created";
    }).length ?? 0,
    pending: shipments?.filter((s) => {
      const meta = parseMetadata(s.courierMetadata);
      return meta?.bookingStatus === "creating" || meta?.bookingStatus === "order_created" || meta?.bookingStatus === "awb_assigning";
    }).length ?? 0,
    failed: shipments?.filter((s) => {
      const meta = parseMetadata(s.courierMetadata);
      return meta?.bookingStatus === "failed";
    }).length ?? 0,
    unknown: shipments?.filter((s) => {
      const meta = parseMetadata(s.courierMetadata);
      return meta?.bookingStatus === "unknown";
    }).length ?? 0,
  };

  // Get recent shipments (last 10)
  const recentShipments = shipments
    ?.sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shiprocket</h1>
        <p className="text-muted-foreground">
          Manage courier delivery for MB Mart orders
        </p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Connection Status
          </CardTitle>
          <CardDescription>
            Shiprocket integration for automated courier booking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Automatic Booking</span>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  Enabled
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Orders are automatically booked with Shiprocket after payment confirmation
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Environment</span>
                <Badge variant="outline">Production</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Connected to Shiprocket production API
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Mart Store</span>
                {martBU ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                    Not Found
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {martBU ? `${martBU.name} (pincode_region mode)` : "No business unit with pincode_region mode found"}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Pickup Location</span>
                <Badge variant="outline">Primary</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Default pickup location for shipments
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shipment Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Shipment Statistics
          </CardTitle>
          <CardDescription>
            Overview of all Mart shipments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.booked}</div>
              <div className="text-xs text-muted-foreground">Booked</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.unknown}</div>
              <div className="text-xs text-muted-foreground">Unknown</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Shipments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Recent Shipments
          </CardTitle>
          <CardDescription>
            Last 10 shipments for MB Mart
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentShipments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No shipments found
            </p>
          ) : (
            <div className="space-y-3">
              {recentShipments.map((shipment) => {
                const meta = parseMetadata(shipment.courierMetadata);
                const bookingStatus = meta?.bookingStatus ?? "not_started";

                return (
                  <div
                    key={shipment._id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {shipment.awbNumber ?? "No AWB"}
                        </span>
                        <Badge
                          variant={
                            bookingStatus === "created"
                              ? "default"
                              : bookingStatus === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {bookingStatus === "created"
                            ? "Booked"
                            : bookingStatus === "failed"
                              ? "Failed"
                              : bookingStatus === "unknown"
                                ? "Unknown"
                                : "Pending"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {shipment.courierProvider ?? "No provider"} •{" "}
                        {new Date(shipment.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`${ROUTES.ADMIN.ORDERS}?highlight=${shipment.orderId}`}>
                        View Order
                      </a>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks for managing Shiprocket shipments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Button variant="outline" asChild>
              <a href={ROUTES.ADMIN.ORDERS}>
                <Package className="h-4 w-4 mr-2" />
                View All Orders
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={ROUTES.ADMIN.SHIPPING_CONFIG}>
                <Truck className="h-4 w-4 mr-2" />
                Shipping Settings
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
