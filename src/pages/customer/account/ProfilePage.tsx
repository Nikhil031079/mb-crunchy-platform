import { useState, useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { api } from "@convex/_generated/api";

import { useAuth } from "@/hooks/use-auth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";

import type { Order } from "@/types";

export default function ProfilePage() {
  const { user } = useAuth();
  const customer = useQuery(api.customers.getByAuthUser, {});
  const updateProfile = useMutation(api.customers.updateProfile);

  // "Total Paid" counts money actually collected — only orders with a verified
  // payment are included, so unpaid/pending/cancelled/refunded orders never
  // overstate what the customer has really spent.
  const orders = useQuery(
    api.orders.getByCustomer,
    customer ? { customerId: customer._id } : "skip",
  ) as Order[] | undefined;

  const totalPaid = useMemo(
    () =>
      (orders ?? []).reduce(
        (sum, o) => (o.paymentStatus === "paid" ? sum + (o.total ?? 0) : sum),
        0,
      ),
    [orders],
  );

  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [errors, setErrors] = useState<{ name?: string; phone?: string; email?: string }>({});
  const [isSaving, setIsSaving] = useState(false);

  // Populate form when customer data loads
  useEffect(() => {
    if (customer) {
      setName(customer.name ?? "");
      setEmail(customer.email ?? "");
      setPhone(customer.phone ?? "");
    }
  }, [customer]);

  const validate = useCallback(() => {
    const newErrors: typeof errors = {};
    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }
    if (!phone.trim() || phone.trim().length < 7) {
      newErrors.phone = "Phone must be at least 7 characters";
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = "Please enter a valid email";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, phone, email]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      toast.success("Profile updated successfully");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  }, [name, email, phone, validate, updateProfile]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Full Name</Label>
            <Input
              id="profile-name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(errors.name && "border-destructive")}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-phone">
              Phone Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="profile-phone"
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={cn(errors.phone && "border-destructive")}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(errors.email && "border-destructive")}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Member Since</p>
              <p className="text-sm font-medium">
                {customer?.createdAt
                  ? new Date(customer.createdAt).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-sm font-medium">{customer?.totalOrders ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Paid</p>
              <p className="text-sm font-medium">{formatCurrency(totalPaid)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
