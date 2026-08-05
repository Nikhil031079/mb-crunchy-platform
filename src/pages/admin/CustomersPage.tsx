import { useState, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/admin/design-system/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/utils";
import type { Customer, Order, CustomerAddress, LoyaltyAccount } from "@/types";
import {
  Users,
  Search,
  Eye,
  ChevronUp,
  ChevronDown,
  Star,
  MapPin,
  ShoppingBag,
  UserRound,
  History,
  LineChart,
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  inactive: "bg-yellow-100 text-yellow-800 border-yellow-200",
  archived: "bg-gray-100 text-gray-600 border-gray-200",
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  preparing: "bg-orange-100 text-orange-800",
  ready: "bg-indigo-100 text-indigo-800",
  out_for_delivery: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-600",
};

const TIER_STYLES: Record<string, string> = {
  bronze: "bg-orange-100 text-orange-800",
  silver: "bg-gray-100 text-gray-700",
  gold: "bg-yellow-100 text-yellow-800",
  platinum: "bg-purple-100 text-purple-800",
};

const LIFECYCLE_STYLES: Record<string, string> = {
  Lead: "bg-gray-100 text-gray-700",
  New: "bg-blue-100 text-blue-800",
  Active: "bg-green-100 text-green-800",
  Loyal: "bg-teal-100 text-teal-800",
  VIP: "bg-purple-100 text-purple-800",
  Dormant: "bg-yellow-100 text-yellow-800",
  Lost: "bg-red-100 text-red-800",
};

const HEALTH_STYLES: Record<string, string> = {
  Excellent: "bg-green-100 text-green-800",
  Healthy: "bg-teal-100 text-teal-800",
  "Needs Attention": "bg-orange-100 text-orange-800",
  Dormant: "bg-yellow-100 text-yellow-800",
  Lost: "bg-red-100 text-red-800",
};

const TIMELINE_EVENT_ICONS: Record<string, string> = {
  customer_created: "👤",
  order_created: "🛒",
  order_completed: "✅",
  order_cancelled: "❌",
  refund: "💰",
  loyalty: "⭐",
  referral: "👥",
};

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

type SortField = "name" | "totalSpent" | "totalOrders" | "createdAt";
type SortDir = "asc" | "desc";

export default function CustomersPage() {
  const customers = useQuery(api.customers.getAll);
  const orders = useQuery(api.orders.getAll);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const isLoading = customers === undefined || orders === undefined;

  // Money actually collected per customer — only verified payments count so
  // pending/unpaid/cancelled/refunded orders never overstate the total.
  const paidSpentByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of (orders ?? []) as Order[]) {
      if (o.paymentStatus !== "paid") continue;
      if (o.customerId) {
        map.set(o.customerId, (map.get(o.customerId) ?? 0) + (o.total ?? 0));
      }
    }
    return map;
  }, [orders]);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];

    let list = [...customers] as Customer[];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q),
      );
    }

    if (statusFilter !== "all") {
      list = list.filter((c) => c.status === statusFilter);
    }

    list.sort((a, b) => {
      if (sortField === "totalSpent") {
        const aVal = paidSpentByCustomer.get(a._id) ?? 0;
        const bVal = paidSpentByCustomer.get(b._id) ?? 0;
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return list;
  }, [customers, search, statusFilter, sortField, sortDir, paidSpentByCustomer]);

  const summaryStats = useMemo(() => {
    if (!customers) return null;
    const list = customers as Customer[];
    const totalCustomers = list.length;
    const activeCustomers = list.filter((c) => c.status === "active").length;
    let totalRevenue = 0;
    for (const value of paidSpentByCustomer.values()) totalRevenue += value;
    const avgLtv = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
    return { totalCustomers, activeCustomers, totalRevenue, avgLtv };
  }, [customers, paidSpentByCustomer]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="size-3 ml-1 inline" />
    ) : (
      <ChevronDown className="size-3 ml-1 inline" />
    );
  };

  const openCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDialogOpen(true);
  };

  return (
    <div>
      <PageHeader title="Customers" description="View and manage your customer base" />

      {/* Summary Cards */}
      <motion.div {...fadeUp} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {isLoading ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/60 p-5 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32" />
              </div>
            ))}
          </>
        ) : summaryStats ? (
          <>
            <StatCard label="Total Customers" value={summaryStats.totalCustomers} />
            <StatCard label="Active Customers" value={summaryStats.activeCustomers} />
            <StatCard label="Collected Revenue" value={formatCurrency(summaryStats.totalRevenue)} />
            <StatCard label="Average LTV" value={formatCurrency(summaryStats.avgLtv)} />
          </>
        ) : null}
      </motion.div>

      {/* Search & Filters */}
      <motion.div {...fadeUp} className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Customer Table */}
      <motion.div {...fadeUp}>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                    Name <SortIcon field="name" />
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("totalOrders")}>
                    Orders <SortIcon field="totalOrders" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("totalSpent")}>
                    Total Paid <SortIcon field="totalSpent" />
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("createdAt")}>
                    Joined <SortIcon field="createdAt" />
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <Users className="size-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        {search || statusFilter !== "all"
                          ? "No customers match your filters"
                          : "No customers yet"}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => (
                    <TableRow
                      key={customer._id}
                      className="cursor-pointer"
                      onClick={() => openCustomer(customer)}
                    >
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell className="text-muted-foreground">{customer.email ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{customer.phone ?? "—"}</TableCell>
                      <TableCell>{customer.totalOrders}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(paidSpentByCustomer.get(customer._id) ?? 0)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[customer.status])}>
                          {customer.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(customer.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openCustomer(customer); }}>
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      {/* Customer Detail Dialog */}
      <CustomerDetailDialog customer={selectedCustomer} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function CustomerDetailDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const customerId = customer?._id as Id<"customers"> | undefined;

  const orders = useQuery(api.orders.getByCustomer, customerId ? { customerId } : "skip");
  const addresses = useQuery(api.addresses.getByCustomer, customerId ? { customerId } : "skip");
  const loyalty = useQuery(api.loyalty.getBalance, customerId ? { customerId } : "skip");
  const tierProgress = useQuery(api.loyalty.getTierProgress, customerId ? { customerId } : "skip");
  const loyaltyTransactions = useQuery(api.loyalty.getTransactions, customerId ? { customerId } : "skip");
  const customer360 = useQuery(api.customers.getCustomer360, customerId ? { customerId } : "skip");
  const customerInsights = useQuery(api.customers.getCustomerInsights, customerId ? { customerId } : "skip");
  const timeline = useQuery(api.customers.getCustomerTimeline, customerId ? { customerId } : "skip");

  if (!customer) return null;

  const recentOrders = (orders ?? []).slice(0, 10) as Order[];
  const customerAddresses = (addresses ?? []) as CustomerAddress[];
  const loyaltyData = loyalty as LoyaltyAccount | null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer.name}</DialogTitle>
          <DialogDescription>
            {customer.email ?? "No email"} · {customer.phone ?? "No phone"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Overview */}
          <Collapsible defaultOpen className="rounded-lg border bg-card overflow-hidden">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <UserRound className="size-4 text-muted-foreground" />
                Overview
              </span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t px-4 py-4 space-y-4">
                {customer360 === undefined || customerInsights === undefined ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="rounded-lg border p-3 space-y-2">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    ))}
                  </div>
                ) : customer360 && customerInsights ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold">
                          {customer360.customer.name || "—"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {customer360.customer.phone || "No phone"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn("capitalize", STATUS_STYLES[customer360.customer.status] ?? "")}
                        >
                          {customer360.customer.status}
                        </Badge>
                        <Badge variant="outline" className={LIFECYCLE_STYLES[customerInsights.lifecycle] ?? ""}>
                          {customerInsights.lifecycle}
                        </Badge>
                        <Badge variant="outline" className={HEALTH_STYLES[customerInsights.health] ?? ""}>
                          {customerInsights.health}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <OverviewTile label="Lifetime Spend" value={formatCurrency(customer360.lifetimeSpend)} />
                      <OverviewTile label="Total Orders" value={customer360.totalOrders} />
                      <OverviewTile label="Average Order Value" value={formatCurrency(customer360.averageOrderValue)} />
                      <OverviewTile
                        label="First Order"
                        value={customer360.firstOrderAt ? formatDate(customer360.firstOrderAt) : "—"}
                      />
                      <OverviewTile
                        label="Last Order"
                        value={customer360.lastOrderAt ? formatDate(customer360.lastOrderAt) : "—"}
                      />
                      <OverviewTile
                        label="Preferred Business Unit"
                        value={customer360.preferredBusinessUnitName ?? "—"}
                      />
                      <OverviewTile
                        label="Favourite Category"
                        value={customerInsights.ordering.favouriteCategory?.name ?? "—"}
                      />
                      <OverviewTile label="Joined" value={formatDate(customer360.customer.createdAt)} />
                    </div>
                  </>
                ) : null}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Timeline */}
          <Collapsible className="rounded-lg border bg-card overflow-hidden">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <History className="size-4 text-muted-foreground" />
                Timeline
              </span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t px-4 py-4">
                {timeline === undefined ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Skeleton className="size-9 rounded-full shrink-0" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (timeline ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No customer activity yet.</p>
                ) : (
                  <ol className="space-y-4">
                    {(timeline ?? []).map((event, i) => (
                      <li key={`${event.type}-${event.timestamp}-${i}`} className="flex items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-card text-base">
                          {TIMELINE_EVENT_ICONS[event.type] ?? "•"}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{event.title}</p>
                            {event.orderNumber ? (
                              <Badge variant="outline" className="text-[10px]">
                                {event.orderNumber}
                              </Badge>
                            ) : null}
                            {event.amount !== undefined ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {formatCurrency(event.amount)}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(event.timestamp)} ·{" "}
                            {new Date(event.timestamp).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                          {event.description ? (
                            <p className="text-xs text-muted-foreground">{event.description}</p>
                          ) : null}
                          {event.metadata && Object.keys(event.metadata).length > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              {Object.entries(event.metadata)
                                .map(([key, value]) => `${key}: ${value ?? "—"}`)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Intelligence */}
          <Collapsible className="rounded-lg border bg-card overflow-hidden">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <LineChart className="size-4 text-muted-foreground" />
                Intelligence
              </span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t px-4 py-4">
                {customerInsights === undefined ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="rounded-lg border p-3 space-y-1">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    ))}
                  </div>
                ) : customerInsights === null ? (
                  <p className="text-sm text-muted-foreground py-2">No customer insights available.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <OverviewTile
                      label="Favourite Product"
                      value={customerInsights.ordering.favouriteProduct?.name ?? "—"}
                    />
                    <OverviewTile
                      label="Favourite Category"
                      value={customerInsights.ordering.favouriteCategory?.name ?? "—"}
                    />
                    <OverviewTile
                      label="Preferred Business Unit"
                      value={customerInsights.ordering.favouriteBusinessUnit?.name ?? "—"}
                    />
                    <OverviewTile
                      label="Preferred Order Type"
                      value={formatOrderType(customerInsights.ordering.preferredOrderType)}
                    />
                    <OverviewTile
                      label="Favourite Ordering Hour"
                      value={formatHour(customerInsights.activity.favouriteOrderingHour?.hour)}
                    />
                    <OverviewTile
                      label="Favourite Ordering Day"
                      value={customerInsights.activity.favouriteOrderingDay?.name ?? "—"}
                    />
                    <OverviewTile
                      label="Highest Order"
                      value={formatCurrency(customerInsights.purchase.highestOrderValue)}
                    />
                    <OverviewTile
                      label="Lowest Order"
                      value={formatCurrency(customerInsights.purchase.lowestOrderValue)}
                    />
                    <OverviewTile
                      label="Average Order"
                      value={formatCurrency(customerInsights.purchase.averageOrderValue)}
                    />
                    <OverviewTile
                      label="Lifetime Spend"
                      value={formatCurrency(customerInsights.purchase.lifetimeSpend)}
                    />
                    <OverviewTile
                      label="Customer Health"
                      value={
                        <Badge variant="outline" className={HEALTH_STYLES[customerInsights.health] ?? ""}>
                          {customerInsights.health}
                        </Badge>
                      }
                    />
                    <OverviewTile
                      label="Customer Lifecycle"
                      value={
                        <Badge variant="outline" className={LIFECYCLE_STYLES[customerInsights.lifecycle] ?? ""}>
                          {customerInsights.lifecycle}
                        </Badge>
                      }
                    />
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Loyalty */}
          <Collapsible className="rounded-lg border bg-card overflow-hidden">
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Star className="size-4 text-muted-foreground" />
                Loyalty
              </span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t px-4 py-4">
                {loyalty === undefined || tierProgress === undefined || loyaltyTransactions === undefined ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="rounded-lg border p-3 space-y-1">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    ))}
                  </div>
                ) : !loyaltyData ? (
                  <p className="text-sm text-muted-foreground py-2">No loyalty information available.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <OverviewTile label="Current Loyalty Points" value={loyaltyData.pointsBalance} />
                      <OverviewTile
                        label="Current Tier"
                        value={
                          <Badge variant="outline" className={cn("capitalize", TIER_STYLES[loyaltyData.tier] ?? "")}>
                            {loyaltyData.tier}
                          </Badge>
                        }
                      />
                      <OverviewTile label="Lifetime Points Earned" value={loyaltyData.totalEarned} />
                      <OverviewTile label="Lifetime Points Redeemed" value={loyaltyData.totalRedeemed} />
                      <OverviewTile
                        label="Points Required For Next Tier"
                        value={tierProgress.nextTier ? tierProgress.pointsToNextTier : "—"}
                      />
                      <OverviewTile label="Member Since" value={formatDate(loyaltyData.createdAt)} />
                      <OverviewTile
                        label="Last Loyalty Activity"
                        value={
                          loyaltyTransactions.length > 0
                            ? formatDate(loyaltyTransactions[0].createdAt)
                            : "—"
                        }
                      />
                    </div>
                    <div className="mt-3 rounded-lg border p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Current Progress</p>
                        <p className="text-xs font-medium">
                          {tierProgress.nextTier
                            ? `${loyaltyProgress(loyaltyData.totalEarned, tierProgress.pointsToNextTier)}% to ${capitalizeTier(tierProgress.nextTier)}`
                            : "Top tier reached"}
                        </p>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-amber-500"
                          style={{ width: `${loyaltyProgress(loyaltyData.totalEarned, tierProgress.pointsToNextTier)}%` }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Loyalty */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="size-4" />
                Loyalty
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loyaltyData ? (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Points Balance</p>
                    <p className="text-lg font-bold">{loyaltyData.pointsBalance}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Earned</p>
                    <p className="text-lg font-bold">{loyaltyData.totalEarned}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tier</p>
                    <Badge variant="outline" className={cn("capitalize", TIER_STYLES[loyaltyData.tier] ?? "")}>
                      {loyaltyData.tier}
                    </Badge>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No loyalty account yet</p>
              )}
            </CardContent>
          </Card>

          {/* Saved Addresses */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="size-4" />
                Saved Addresses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {customerAddresses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No saved addresses</p>
              ) : (
                <div className="space-y-2">
                  {customerAddresses.map((addr) => (
                    <div key={addr._id} className="flex items-start gap-3 rounded-lg border p-3">
                      <MapPin className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {addr.label}
                          {addr.isDefault && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">Default</Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {addr.address}
                          {addr.city ? `, ${addr.city}` : ""}
                          {addr.state ? `, ${addr.state}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Orders */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShoppingBag className="size-4" />
                Recent Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders yet</p>
              ) : (
                <div className="space-y-2">
                  {recentOrders.map((order) => (
                    <div key={order._id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.items.length} items · {formatDate(order.createdAt, "relative")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] capitalize", ORDER_STATUS_COLORS[order.status] ?? "")}
                        >
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OverviewTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border p-3 space-y-1 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}

function formatHour(hour: number | undefined): string {
  if (hour === undefined) return "—";
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

function formatOrderType(orderType: string | null): string {
  if (!orderType) return "—";
  return orderType.charAt(0).toUpperCase() + orderType.slice(1);
}

function loyaltyProgress(totalEarned: number, pointsToNextTier: number | null): number {
  if (pointsToNextTier === null) return 100;
  const threshold = totalEarned + pointsToNextTier;
  if (threshold <= 0) return 100;
  return Math.min(100, Math.round((totalEarned / threshold) * 100));
}

function capitalizeTier(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
