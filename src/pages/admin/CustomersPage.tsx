import { useState, useMemo } from "react";
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

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

type SortField = "name" | "totalSpent" | "totalOrders" | "createdAt";
type SortDir = "asc" | "desc";

export default function CustomersPage() {
  const customers = useQuery(api.customers.getAll);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const isLoading = customers === undefined;

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
  }, [customers, search, statusFilter, sortField, sortDir]);

  const summaryStats = useMemo(() => {
    if (!customers) return null;
    const list = customers as Customer[];
    const totalCustomers = list.length;
    const activeCustomers = list.filter((c) => c.status === "active").length;
    const totalRevenue = list.reduce((sum, c) => sum + c.totalSpent, 0);
    const avgLtv = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
    return { totalCustomers, activeCustomers, totalRevenue, avgLtv };
  }, [customers]);

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
            <StatCard label="Total Revenue" value={formatCurrency(summaryStats.totalRevenue)} />
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
                    Total Spent <SortIcon field="totalSpent" />
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
                      <TableCell className="font-medium">{formatCurrency(customer.totalSpent)}</TableCell>
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
          {/* Profile & Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Total Orders</p>
              <p className="text-xl font-bold">{customer.totalOrders}</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Lifetime Value</p>
              <p className="text-xl font-bold">{formatCurrency(customer.totalSpent)}</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[customer.status])}>
                {customer.status}
              </Badge>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Joined</p>
              <p className="text-sm font-medium">{formatDate(customer.createdAt)}</p>
            </div>
          </div>

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
