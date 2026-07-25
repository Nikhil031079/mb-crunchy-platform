import { Link } from "react-router";
import { useQuery } from "convex/react";
import {
  Star,
  Package,
  MapPin,
  Tag,
  CheckCircle2,
  Circle,
  ArrowRight,
} from "lucide-react";

import { api } from "@convex/_generated/api";

import { useAuth } from "@/hooks/use-auth";
import { ROUTES } from "@/constants";
import { formatCurrency } from "@/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

import type { Order, CustomerAddress, LoyaltyAccount, LoyaltySettings } from "@/types";

const TIER_COLORS: Record<string, string> = {
  bronze: "bg-amber-600",
  silver: "bg-gray-400",
  gold: "bg-yellow-500",
  platinum: "bg-purple-600",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-orange-100 text-orange-800",
  ready: "bg-green-100 text-green-800",
  out_for_delivery: "bg-purple-100 text-purple-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
};

export default function AccountDashboardPage() {
  const { user } = useAuth();

  const customer = useQuery(api.customers.getByAuthUser, {});
  const loyaltyAccount = useQuery(
    api.loyalty.getBalance,
    customer ? { customerId: customer._id } : "skip",
  );
  const loyaltySettings = useQuery(api.loyalty.getSettings, {});
  const tierProgress = useQuery(
    api.loyalty.getTierProgress,
    customer ? { customerId: customer._id } : "skip",
  );

  const orders = useQuery(
    api.orders.getByCustomer,
    customer ? { customerId: customer._id } : "skip",
  ) as Order[] | undefined;

  const addresses = useQuery(
    api.addresses.getByCustomer,
    customer ? { customerId: customer._id } : "skip",
  ) as CustomerAddress[] | undefined;

  const recentOrders = orders?.slice(0, 3) ?? [];
  const savedAddresses = addresses?.slice(0, 3) ?? [];

  // Profile completion calculation
  const completionItems = [
    { label: "Name", completed: !!user?.name, href: ROUTES.ACCOUNT.PROFILE },
    { label: "Email", completed: !!user?.email, href: ROUTES.ACCOUNT.PROFILE },
    { label: "Phone", completed: !!customer?.phone, href: ROUTES.ACCOUNT.PROFILE },
    { label: "Saved Address", completed: (addresses?.length ?? 0) > 0, href: ROUTES.ACCOUNT.ADDRESSES },
    { label: "First Order", completed: (customer?.totalOrders ?? 0) > 0, href: "/" },
  ];
  const completionCount = completionItems.filter((i) => i.completed).length;
  const completionPercent = Math.round((completionCount / completionItems.length) * 100);

  return (
    <div className="space-y-6">
      {/* Profile Completion Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Profile Completion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{completionPercent}% complete</span>
            <span className="font-medium">{completionCount}/{completionItems.length}</span>
          </div>
          <Progress value={completionPercent} className="h-2" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {completionItems.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                className="flex items-center gap-2 text-sm hover:underline"
              >
                {item.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <span className={item.completed ? "text-foreground" : "text-muted-foreground"}>
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Loyalty Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4" />
                Loyalty Points
              </CardTitle>
              {loyaltyAccount && (
                <Badge className={`${TIER_COLORS[loyaltyAccount.tier]} text-white`}>
                  {loyaltyAccount.tier.charAt(0).toUpperCase() + loyaltyAccount.tier.slice(1)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-4">
              <div className="text-3xl font-bold text-primary">
                {loyaltyAccount?.pointsBalance ?? 0}
              </div>
              <p className="text-sm text-muted-foreground mt-1">points available</p>
            </div>
            {tierProgress?.nextTier && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{tierProgress.tier}</span>
                  <span>{tierProgress.nextTier}</span>
                </div>
                <Progress
                  value={
                    loyaltySettings
                      ? Math.min(100, (tierProgress.pointsToNextTier > 0
                          ? ((loyaltyAccount?.totalEarned ?? 0) /
                              loyaltySettings.tierThresholds[tierProgress.nextTier]) * 100
                          : 100))
                      : 0
                  }
                  className="h-1.5"
                />
                <p className="text-xs text-muted-foreground text-center">
                  {tierProgress.pointsToNextTier} more points to {tierProgress.nextTier}
                </p>
              </div>
            )}
            <Link to={ROUTES.ACCOUNT.LOYALTY}>
              <Button variant="outline" size="sm" className="w-full gap-2">
                View History <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Current Offers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Current Offers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Browse our latest deals and promotions.
            </p>
            <Link to="/">
              <Button variant="outline" size="sm" className="w-full gap-2 mt-4">
                Browse Offers <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              Recent Orders
            </CardTitle>
            {orders && orders.length > 0 && (
              <Link to={ROUTES.ACCOUNT.ORDERS}>
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  View All <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No orders yet. Start ordering to earn loyalty points!
            </p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div
                  key={order._id}
                  className="flex items-center justify-between rounded-lg border border-border/60 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()} · {order.items.length} item(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className={`${STATUS_COLORS[order.status]} text-xs`}>
                      {order.status.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-sm font-medium">{formatCurrency(order.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Saved Addresses */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Saved Addresses
            </CardTitle>
            <Link to={ROUTES.ACCOUNT.ADDRESSES}>
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                Manage <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {savedAddresses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No saved addresses yet.
            </p>
          ) : (
            <div className="space-y-3">
              {savedAddresses.map((addr) => (
                <div
                  key={addr._id}
                  className="rounded-lg border border-border/60 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{addr.label}</span>
                    {addr.isDefault && (
                      <Badge variant="secondary" className="text-xs">Default</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{addr.address}</p>
                  {addr.landmark && (
                    <p className="text-xs text-muted-foreground">Landmark: {addr.landmark}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
