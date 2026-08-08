import { useEffect, useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { toast } from "sonner";
import { Loader2, Save, Globe, Building2, Clock, DollarSign, Mail, Phone, MapPin, Share2, ShieldCheck, Eye, EyeOff, KeyRound, LogOut, CreditCard, Users, UserPlus, UserCheck, UserX, Edit2, Trash2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

import { PageHeader } from "@/components/shared/PageHeader";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useNavigate } from "react-router";
import { ROUTES } from "@/constants";
import { cn } from "@/lib/utils";

import type { Id } from "@convex/_generated/dataModel";

import { hashPassword } from "@/utils/crypto";

// ============================================================================
// Opening Hours Helpers
// ============================================================================

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

type OpeningHours = Record<string, { open: string; close: string }>;

function defaultOpeningHours(): OpeningHours {
  const hours: OpeningHours = {};
  for (const day of DAYS) {
    hours[day] = { open: "09:00", close: "21:00" };
  }
  return hours;
}

// ============================================================================
// Settings Page
// ============================================================================

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Configure your platform and business unit settings"
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <SettingsNav />

        <div className="space-y-8">
          <GlobalSettingsSection />
          <Separator />
          <BusinessUnitSettingsSection />
          <Separator />
          <AuthSecuritySection />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Settings Navigation
// ============================================================================

function SettingsNav() {
  return (
    <nav className="space-y-1">
      <div className="rounded-lg border p-3 space-y-1">
        <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sections</p>
        {[
          { label: "Global Settings", icon: Globe, href: "#global" },
          { label: "Business Unit Settings", icon: Building2, href: "#business-unit" },
          { label: "Auth & Security", icon: ShieldCheck, href: "#auth-security" },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

// ============================================================================
// Global Settings
// ============================================================================

function GlobalSettingsSection() {
  const { getSessionToken } = useAdminAuth();
  const globalSettings = useQuery(api.settings.getGlobalSettings);
  const upsertGlobal = useMutation(api.settings.upsertGlobalSettings);

  const [form, setForm] = useState({
    siteName: "",
    siteDescription: "",
    logo: "",
    favicon: "",
    primaryColor: "#000000",
    supportEmail: "",
    supportPhone: "",
    paymentMode: "upi_qr" as "upi_qr" | "razorpay",
    upiId: "",
    merchantName: "",
    whatsappNumber: "",
    qrDisplayName: "",
    paymentInstructions: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (globalSettings && !loaded) {
      setForm({
        siteName: globalSettings.siteName ?? "",
        siteDescription: globalSettings.siteDescription ?? "",
        logo: globalSettings.logo ?? "",
        favicon: globalSettings.favicon ?? "",
        primaryColor: globalSettings.primaryColor ?? "#000000",
        supportEmail: globalSettings.supportEmail ?? "",
        supportPhone: globalSettings.supportPhone ?? "",
        paymentMode: globalSettings.paymentConfig?.mode ?? "upi_qr",
        upiId: globalSettings.paymentConfig?.upiId ?? "",
        merchantName: globalSettings.paymentConfig?.merchantName ?? "",
        whatsappNumber: globalSettings.paymentConfig?.whatsappNumber ?? "",
        qrDisplayName: globalSettings.paymentConfig?.qrDisplayName ?? "",
        paymentInstructions: globalSettings.paymentConfig?.paymentInstructions ?? "",
      });
      setLoaded(true);
    }
  }, [globalSettings, loaded]);

  const handleSave = async () => {
    if (!form.siteName.trim()) {
      toast.error("Site name is required");
      return;
    }
    setIsSaving(true);
    try {
      await upsertGlobal({
        sessionToken: getSessionToken()!,
        siteName: form.siteName.trim(),
        siteDescription: form.siteDescription.trim() || undefined,
        logo: form.logo.trim() || undefined,
        favicon: form.favicon.trim() || undefined,
        primaryColor: form.primaryColor,
        supportEmail: form.supportEmail.trim() || undefined,
        supportPhone: form.supportPhone.trim() || undefined,
        paymentConfig: {
          mode: form.paymentMode,
          upiId: form.upiId.trim() || undefined,
          merchantName: form.merchantName.trim() || undefined,
          whatsappNumber: form.whatsappNumber.trim() || undefined,
          qrDisplayName: form.qrDisplayName.trim() || undefined,
          paymentInstructions: form.paymentInstructions.trim() || undefined,
        },
      });
      toast.success("Global settings saved");
    } catch (err) {
      toast.error("Failed to save", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsSaving(false);
    }
  };

  if (globalSettings === undefined) {
    return <SettingsLoadingSkeleton title="Global Settings" />;
  }

  return (
    <section id="global" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Globe className="h-5 w-5 text-muted-foreground" />
            Global Settings
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Platform-wide configuration</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
          Save
        </Button>
      </div>

      <div className="rounded-xl border p-6 space-y-5">
        {/* Site Name */}
        <div className="grid gap-2">
          <Label htmlFor="siteName">Site Name</Label>
          <Input id="siteName" value={form.siteName} onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))} placeholder="MB CRUNCHY" />
        </div>

        {/* Site Description */}
        <div className="grid gap-2">
          <Label htmlFor="siteDescription">Site Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="siteDescription" value={form.siteDescription} onChange={(e) => setForm((f) => ({ ...f, siteDescription: e.target.value }))} placeholder="Your premium destination..." rows={2} />
        </div>

        {/* Logo + Favicon URLs */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="logo">Logo URL <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="logo" value={form.logo} onChange={(e) => setForm((f) => ({ ...f, logo: e.target.value }))} placeholder="https://..." />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="favicon">Favicon URL <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id="favicon" value={form.favicon} onChange={(e) => setForm((f) => ({ ...f, favicon: e.target.value }))} placeholder="https://..." />
          </div>
        </div>

        {/* Primary Color */}
        <div className="grid gap-2">
          <Label htmlFor="primaryColor">Primary Color</Label>
          <div className="flex items-center gap-3">
            <Input
              id="primaryColor"
              type="color"
              value={form.primaryColor}
              onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
              className="h-10 w-16 cursor-pointer p-1"
            />
            <Input
              value={form.primaryColor}
              onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
              className="w-32"
              placeholder="#000000"
            />
          </div>
        </div>

        <Separator />

        {/* Support Contact */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Support Contact
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="supportEmail">Support Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="supportEmail" type="email" value={form.supportEmail} onChange={(e) => setForm((f) => ({ ...f, supportEmail: e.target.value }))} placeholder="support@example.com" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supportPhone">Support Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="supportPhone" type="tel" value={form.supportPhone} onChange={(e) => setForm((f) => ({ ...f, supportPhone: e.target.value }))} placeholder="+1 (555) 000-0000" />
            </div>
          </div>
        </div>

        <Separator />

        {/* Payment Settings (Global) */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            Payment Settings
          </h3>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Payment Mode</Label>
              <Select value={form.paymentMode} onValueChange={(v) => setForm((f) => ({ ...f, paymentMode: v as "upi_qr" | "razorpay" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upi_qr">UPI QR Code</SelectItem>
                  <SelectItem value="razorpay">Razorpay (Coming Soon)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.paymentMode === "upi_qr" && (
              <>
                <div className="grid gap-2">
                  <Label>UPI ID <span className="font-normal text-muted-foreground">(required for UPI)</span></Label>
                  <Input value={form.upiId} onChange={(e) => setForm((f) => ({ ...f, upiId: e.target.value }))} placeholder="yourname@upi" />
                </div>
                <div className="grid gap-2">
                  <Label>Merchant Name <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input value={form.merchantName} onChange={(e) => setForm((f) => ({ ...f, merchantName: e.target.value }))} placeholder="MB Crunchy" />
                </div>
                <div className="grid gap-2">
                  <Label>QR Display Name <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input value={form.qrDisplayName} onChange={(e) => setForm((f) => ({ ...f, qrDisplayName: e.target.value }))} placeholder="MB Crunchy" />
                </div>
                <div className="grid gap-2">
                  <Label>Payment Instructions <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Textarea value={form.paymentInstructions} onChange={(e) => setForm((f) => ({ ...f, paymentInstructions: e.target.value }))} placeholder="Scan QR to pay..." rows={2} />
                </div>
                <div className="grid gap-2">
                  <Label>WhatsApp Business Number <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input value={form.whatsappNumber} onChange={(e) => setForm((f) => ({ ...f, whatsappNumber: e.target.value }))} placeholder="+91 98765 43210" />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Business Unit Settings
// ============================================================================

function BusinessUnitSettingsSection() {
  const { getSessionToken } = useAdminAuth();
  const allBUs = useQuery(api.businessUnits.getAll);
  const [selectedBuId, setSelectedBuId] = useState<string | null>(null);
  const buSettings = useQuery(
    api.settings.getBusinessUnitSettings,
    selectedBuId ? { businessUnitId: selectedBuId as Id<"businessUnits"> } : "skip"
  );
  const upsertBU = useMutation(api.settings.upsertBusinessUnitSettings);

  const [form, setForm] = useState({
    currency: "INR",
    taxRate: 0,
    deliveryFee: 0,
    freeDeliveryThreshold: "",
    isOpen: true,
    phone: "",
    email: "",
    address: "",
    instagram: "",
    facebook: "",
    twitter: "",
    openingHours: defaultOpeningHours() as OpeningHours,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);

  useEffect(() => {
    if (buSettings && selectedBuId && loaded !== selectedBuId) {
      setForm({
        currency: buSettings.currency ?? "INR",
        taxRate: buSettings.taxRate ?? 0,
        deliveryFee: buSettings.deliveryFee ?? 0,
        freeDeliveryThreshold: buSettings.freeDeliveryThreshold?.toString() ?? "",
        isOpen: buSettings.isOpen ?? true,
        phone: buSettings.phone ?? "",
        email: buSettings.email ?? "",
        address: buSettings.address ?? "",
        instagram: buSettings.socialLinks?.instagram ?? "",
        facebook: buSettings.socialLinks?.facebook ?? "",
        twitter: buSettings.socialLinks?.twitter ?? "",
        openingHours: (buSettings.openingHours as OpeningHours) ?? defaultOpeningHours(),
      });
      setLoaded(selectedBuId);
    }
  }, [buSettings, selectedBuId, loaded]);

  const handleSave = async () => {
    if (!selectedBuId) {
      toast.error("Please select a business unit");
      return;
    }
    setIsSaving(true);
    try {
      await upsertBU({
        sessionToken: getSessionToken()!,
        businessUnitId: selectedBuId as Id<"businessUnits">,
        currency: form.currency,
        taxRate: form.taxRate,
        deliveryFee: form.deliveryFee,
        freeDeliveryThreshold: form.freeDeliveryThreshold ? Number(form.freeDeliveryThreshold) : undefined,
        isOpen: form.isOpen,
        openingHours: form.openingHours,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        socialLinks: {
          instagram: form.instagram.trim() || undefined,
          facebook: form.facebook.trim() || undefined,
          twitter: form.twitter.trim() || undefined,
        },
      });
      toast.success("Business unit settings saved");
    } catch (err) {
      toast.error("Failed to save", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section id="business-unit" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            Business Unit Settings
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Per-store configuration for delivery, tax, and contact info</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={isSaving || !selectedBuId}>
          {isSaving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
          Save
        </Button>
      </div>

      {/* BU Selector */}
      <div className="rounded-xl border p-6">
        <div className="grid gap-2 max-w-md">
          <Label>Select Business Unit</Label>
          {allBUs === undefined ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select
              value={selectedBuId ?? ""}
              onValueChange={(v) => { setSelectedBuId(v); setLoaded(null); }}
            >
              <SelectTrigger><SelectValue placeholder="Choose a business unit..." /></SelectTrigger>
              <SelectContent>
                {(allBUs ?? []).map((bu) => (
                  <SelectItem key={bu._id} value={bu._id}>{bu.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {!selectedBuId && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Select a business unit above to configure its settings.
        </div>
      )}

      {selectedBuId && buSettings === undefined && (
        <SettingsLoadingSkeleton title="Business Unit Settings" />
      )}

      {selectedBuId && buSettings !== undefined && (
        <div className="rounded-xl border p-6 space-y-6">
          {/* Delivery & Tax */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Delivery & Tax
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-2">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR (Indian Rupee)</SelectItem>
                    <SelectItem value="USD">USD (US Dollar)</SelectItem>
                    <SelectItem value="EUR">EUR (Euro)</SelectItem>
                    <SelectItem value="GBP">GBP (British Pound)</SelectItem>
                    <SelectItem value="NGN">NGN (Nigerian Naira)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tax Rate (%)</Label>
                <Input type="number" min="0" max="100" step="0.5" value={form.taxRate} onChange={(e) => setForm((f) => ({ ...f, taxRate: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Delivery Fee</Label>
                <Input type="number" min="0" step="0.01" value={form.deliveryFee} onChange={(e) => setForm((f) => ({ ...f, deliveryFee: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Free Delivery Threshold <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input type="number" min="0" step="0.01" value={form.freeDeliveryThreshold} onChange={(e) => setForm((f) => ({ ...f, freeDeliveryThreshold: e.target.value }))} placeholder="No minimum" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Store Status */}
          <div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Store Open</Label>
                <p className="text-xs text-muted-foreground">Toggle whether the store is accepting orders</p>
              </div>
              <Switch checked={form.isOpen} onCheckedChange={(checked) => setForm((f) => ({ ...f, isOpen: checked }))} />
            </div>
          </div>

          <Separator />

          {/* Opening Hours */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Opening Hours
            </h3>
            <div className="space-y-2">
              {DAYS.map((day) => (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-20 text-sm font-medium">{DAY_LABELS[day]}</span>
                  <Input
                    type="time"
                    value={form.openingHours[day]?.open ?? "09:00"}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      openingHours: { ...f.openingHours, [day]: { ...f.openingHours[day], open: e.target.value } },
                    }))}
                    className="w-32"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="time"
                    value={form.openingHours[day]?.close ?? "21:00"}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      openingHours: { ...f.openingHours, [day]: { ...f.openingHours[day], close: e.target.value } },
                    }))}
                    className="w-32"
                  />
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Contact Information */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Contact Information
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Phone <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
              </div>
              <div className="grid gap-2">
                <Label>Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="store@example.com" />
              </div>
            </div>
            <div className="grid gap-2 mt-4">
              <Label>Address <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Main Street, City, Country" rows={2} />
            </div>
          </div>

          <Separator />

          {/* Social Links */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Share2 className="h-4 w-4 text-muted-foreground" />
              Social Links
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Instagram <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input value={form.instagram} onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))} placeholder="https://instagram.com/..." />
              </div>
              <div className="grid gap-2">
                <Label>Facebook <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input value={form.facebook} onChange={(e) => setForm((f) => ({ ...f, facebook: e.target.value }))} placeholder="https://facebook.com/..." />
              </div>
              <div className="grid gap-2">
                <Label>Twitter <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input value={form.twitter} onChange={(e) => setForm((f) => ({ ...f, twitter: e.target.value }))} placeholder="https://twitter.com/..." />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// Kitchen Staff Management Section
// ============================================================================

function KitchenStaffSection() {
  const { getSessionToken } = useAdminAuth();
  const kitchenStaff = useQuery(api.adminAuth.getKitchenStaff, {
    sessionToken: getSessionToken() ?? "",
  });
  const allBUs = useQuery(api.businessUnits.getAll);
  const createStaff = useMutation(api.adminAuth.createKitchenStaff);
  const updateStaff = useMutation(api.adminAuth.updateKitchenStaff);
  const resetPassword = useMutation(api.adminAuth.resetKitchenStaffPassword);
  const toggleActive = useMutation(api.adminAuth.toggleKitchenStaffActive);

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newBusinessUnitIds, setNewBusinessUnitIds] = useState<string[]>([]);
  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [editBusinessUnitIds, setEditBusinessUnitIds] = useState<string[]>([]);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword || newPassword !== confirmPassword) {
      toast.error("Please fill all fields and ensure passwords match");
      return;
    }
    const token = getSessionToken();
    if (!token) return;

    setIsCreating(true);
    try {
      const { hash: pwHash, salt: pwSalt } = await hashPassword(newPassword);
      const { hash: rkHash, salt: rkSalt } = await hashPassword(newPassword); // Use same for recovery key

      await createStaff({
        sessionToken: token,
        username: newUsername.trim(),
        passwordHash: pwHash,
        passwordSalt: pwSalt,
        recoveryKeyHash: rkHash,
        recoveryKeySalt: rkSalt,
        businessUnitIds: newBusinessUnitIds.length > 0 ? newBusinessUnitIds as Id<"businessUnits">[] : undefined,
      });
      toast.success("Kitchen staff account created");
      setShowCreateDialog(false);
      setNewUsername("");
      setNewPassword("");
      setConfirmPassword("");
      setNewBusinessUnitIds([]);
    } catch (err) {
      toast.error("Failed to create account", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateStaff = async (staffId: string, businessUnitIds: string[]) => {
    const token = getSessionToken();
    if (!token) return;

    setIsUpdating(staffId);
    try {
      await updateStaff({
        sessionToken: token,
        targetAdminId: staffId as Id<"admins">,
        businessUnitIds: businessUnitIds.length > 0 ? businessUnitIds as Id<"businessUnits">[] : undefined,
      });
      toast.success("Business unit assignments updated");
      setShowEditDialog(null);
    } catch (err) {
      toast.error("Failed to update assignments", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleResetPassword = async (staffId: string) => {
    if (!resetNewPassword || resetNewPassword !== resetConfirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    const token = getSessionToken();
    if (!token) return;

    setIsResetting(staffId);
    try {
      const { hash: pwHash, salt: pwSalt } = await hashPassword(resetNewPassword);
      await resetPassword({
        sessionToken: token,
        targetAdminId: staffId as Id<"admins">,
        newPasswordHash: pwHash,
        newPasswordSalt: pwSalt,
      });
      toast.success("Password reset successfully");
      setResetPasswordFor(null);
      setResetNewPassword("");
      setResetConfirmPassword("");
    } catch (err) {
      toast.error("Failed to reset password", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsResetting(null);
    }
  };

  const handleToggleActive = async (staffId: string, active: boolean) => {
    const token = getSessionToken();
    if (!token) return;

    setIsToggling(staffId);
    try {
      await toggleActive({
        sessionToken: token,
        targetAdminId: staffId as Id<"admins">,
        active,
      });
      toast.success(active ? "Account enabled" : "Account disabled");
    } catch (err) {
      toast.error("Failed to update account", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsToggling(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Kitchen Staff Accounts
        </h3>
        <Button size="sm" variant="outline" onClick={() => setShowCreateDialog(true)}>
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Add Staff
        </Button>
      </div>

      {kitchenStaff === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : kitchenStaff.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
          <p>No kitchen staff accounts yet. Click "Add Staff" to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {kitchenStaff.map((staff) => (
            <div key={staff.id} className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{staff.username}</p>
                  <p className="text-xs text-muted-foreground">
                    Created: {new Date(staff.createdAt).toLocaleDateString()}
                    {staff.lastLoginAt && ` • Last login: ${new Date(staff.lastLoginAt).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("px-2 py-1 rounded-full text-xs font-medium", staff.active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>
                  {staff.active ? "Active" : "Disabled"}
                </span>
                
                {allBUs && staff.businessUnitIds && staff.businessUnitIds.length > 0 && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                    {staff.businessUnitIds.map((buId: string) => allBUs.find((bu: any) => bu._id === buId)?.name).filter(Boolean).join(" + ")}
                  </span>
                )}
                
                {allBUs && (!staff.businessUnitIds || staff.businessUnitIds.length === 0) && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                    No assignment
                  </span>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditBusinessUnitIds((staff.businessUnitIds ?? []) as Id<"businessUnits">[]);
                    setShowEditDialog(staff.id);
                  }}
                  disabled={isUpdating === staff.id}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Assign BUs
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetPasswordFor(staff.id)}
                  disabled={isResetting === staff.id}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Reset Password
                </Button>
                <Button
                  variant={staff.active ? "outline" : "secondary"}
                  size="sm"
                  onClick={() => handleToggleActive(staff.id, !staff.active)}
                  disabled={isToggling === staff.id}
                >
                  {isToggling === staff.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : staff.active ? (
                    <UserX className="h-3.5 w-3.5" />
                  ) : (
                    <UserCheck className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Staff Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Kitchen Staff Account</DialogTitle>
            <DialogDescription>
              Kitchen staff can log in at /kitchen/login to access the kitchen dashboard.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateStaff} className="space-y-4">
            <div className="grid gap-2">
              <Label>Username</Label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. kitchen_john"
                autoFocus
                disabled={isCreating}
              />
            </div>
            <div className="grid gap-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter password"
                disabled={isCreating}
              />
            </div>
            <div className="grid gap-2">
              <Label>Confirm Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                disabled={isCreating}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
            {allBUs && (
              <div className="grid gap-2">
                <Label>Assigned Business Units</Label>
                <div className="flex flex-wrap gap-2">
                  {allBUs.map((bu: any) => (
                    <label
                      key={bu._id}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        value={bu._id}
                        checked={newBusinessUnitIds.includes(bu._id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewBusinessUnitIds([...newBusinessUnitIds, bu._id]);
                          } else {
                            setNewBusinessUnitIds(newBusinessUnitIds.filter((id) => id !== bu._id));
                          }
                        }}
                        className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <span>{bu.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Staff will only see orders from assigned business units. Leave empty for no assignment.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating || !newUsername.trim() || !newPassword || newPassword !== confirmPassword}>
                {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Create Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
        </Dialog>

      {/* Reset Password Dialog */}
      {resetPasswordFor && (
        <Dialog open={true} onOpenChange={() => setResetPasswordFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Enter a new password for this kitchen staff account.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); handleResetPassword(resetPasswordFor!); }} className="space-y-4">
              <div className="grid gap-2">
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoFocus
                  disabled={isResetting === resetPasswordFor}
                />
              </div>
              <div className="grid gap-2">
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  disabled={isResetting === resetPasswordFor}
                />
                {resetConfirmPassword && resetNewPassword !== resetConfirmPassword && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setResetPasswordFor(null)} disabled={isResetting === resetPasswordFor}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isResetting === resetPasswordFor || !resetNewPassword || resetNewPassword !== resetConfirmPassword}>
                  {isResetting === resetPasswordFor ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Reset Password
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Staff Business Units Dialog */}
      {showEditDialog && allBUs && (
        <Dialog open={true} onOpenChange={() => setShowEditDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Business Unit Assignments</DialogTitle>
              <DialogDescription>
                Select which business units this kitchen staff member can access.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); handleUpdateStaff(showEditDialog!, editBusinessUnitIds); }} className="space-y-4">
              <div className="grid gap-2">
                <Label>Assigned Business Units</Label>
                <div className="flex flex-wrap gap-2">
                  {allBUs.map((bu: any) => (
                    <label
                      key={bu._id}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        value={bu._id}
                        checked={editBusinessUnitIds.includes(bu._id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEditBusinessUnitIds([...editBusinessUnitIds, bu._id]);
                          } else {
                            setEditBusinessUnitIds(editBusinessUnitIds.filter((id) => id !== bu._id));
                          }
                        }}
                        className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <span>{bu.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Staff will only see orders from assigned business units. Leave empty for no assignment.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowEditDialog(null)} disabled={isUpdating === showEditDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isUpdating === showEditDialog}>
                  {isUpdating === showEditDialog ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Save Assignments
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ============================================================================
// Auth & Security Section
// ============================================================================

function AuthSecuritySection() {
  const { admin, getSessionToken, logout } = useAdminAuth();
  const navigate = useNavigate();
  const changeUsernameMutation = useMutation(api.adminAuth.changeUsername);
  const changePasswordMutation = useMutation(api.adminAuth.changePassword);
  const logoutAllMutation = useMutation(api.adminAuth.logoutAllSessions);

  const [newUsername, setNewUsername] = useState("");
  const [currentPasswordForUsername, setCurrentPasswordForUsername] = useState("");
  const [showCurrentPwUsername, setShowCurrentPwUsername] = useState(false);
  const [isChangingUsername, setIsChangingUsername] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwChange, setShowPwChange] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);

  const handleChangeUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getSessionToken();
    if (!token) return;
    setIsChangingUsername(true);
    try {
      const result = await changeUsernameMutation({
        sessionToken: token,
        newUsername: newUsername.trim(),
        currentPassword: currentPasswordForUsername,
      });
      // Update stored session token
      localStorage.setItem("mb-crunchy-admin-session", result.token);
      navigate(0);
    } catch (err) {
      toast.error("Failed to change username", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsChangingUsername(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getSessionToken();
    if (!token) return;
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setIsChangingPassword(true);
    try {
      await changePasswordMutation({
        sessionToken: token,
        currentPassword: currentPassword,
        newPassword: newPassword,
      });
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error("Failed to change password", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogoutAll = async () => {
    const token = getSessionToken();
    if (!token || !admin) return;
    setIsLoggingOutAll(true);
    try {
      await logoutAllMutation({ sessionToken: token, adminId: admin.adminId as any });
      toast.success("All other sessions have been logged out");
    } catch (err) {
      toast.error("Failed to logout sessions", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsLoggingOutAll(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate(ROUTES.ADMIN.LOGIN);
  };

  return (
    <section id="auth-security" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          Auth &amp; Security
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Manage admin credentials and session security</p>
      </div>

      <div className="rounded-xl border p-6 space-y-6">
        {/* Current Admin Info */}
        <div className="rounded-lg bg-muted/50 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-foreground text-background flex items-center justify-center font-semibold text-sm uppercase">
              {admin?.username?.charAt(0) ?? "?"}
            </div>
            <div>
              <p className="font-medium">{admin?.username}</p>
              <p className="text-xs text-muted-foreground capitalize">{admin?.role?.replace("_", " ")}</p>
            </div>
          </div>
        </div>

        {/* Change Username */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            Change Username
          </h3>
          <form onSubmit={handleChangeUsername} className="space-y-3 max-w-md">
            <div className="grid gap-2">
              <Label>New Username</Label>
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Enter new username" disabled={isChangingUsername} />
            </div>
            <div className="grid gap-2">
              <Label>Current Password</Label>
              <div className="relative">
                <Input
                  type={showCurrentPwUsername ? "text" : "password"}
                  value={currentPasswordForUsername}
                  onChange={(e) => setCurrentPasswordForUsername(e.target.value)}
                  placeholder="Confirm with current password"
                  disabled={isChangingUsername}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowCurrentPwUsername((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                  {showCurrentPwUsername ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" size="sm" disabled={isChangingUsername || !newUsername.trim() || !currentPasswordForUsername}>
              {isChangingUsername ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Update Username
            </Button>
          </form>
        </div>

        <Separator />

        {/* Change Password */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Change Password
          </h3>
          <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
            <div className="grid gap-2">
              <Label>Current Password</Label>
              <div className="relative">
                <Input
                  type={showPwChange ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  disabled={isChangingPassword}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowPwChange((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                  {showPwChange ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>New Password</Label>
              <Input type={showPwChange ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" disabled={isChangingPassword} />
            </div>
            <div className="grid gap-2">
              <Label>Confirm New Password</Label>
              <Input type={showPwChange ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" disabled={isChangingPassword} />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
            <Button type="submit" size="sm" disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}>
              {isChangingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Update Password
            </Button>
          </form>
        </div>

        <Separator />

        {/* Kitchen Staff Management */}
        <KitchenStaffSection />

        <Separator />

        {/* Session Management */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <LogOut className="h-4 w-4 text-muted-foreground" />
            Session Management
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Sign Out All Other Sessions</p>
                <p className="text-xs text-muted-foreground">Terminate all other active admin sessions</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogoutAll} disabled={isLoggingOutAll}>
                {isLoggingOutAll ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <LogOut className="h-3.5 w-3.5 mr-1" />}
                Sign Out Others
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div>
                <p className="text-sm font-medium text-destructive">Sign Out</p>
                <p className="text-xs text-muted-foreground">Sign out from this session</p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleSignOut}>
                <LogOut className="h-3.5 w-3.5 mr-1" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function SettingsLoadingSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-xl border p-6 space-y-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="space-y-3">
        <div className="grid gap-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-full" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-10 w-full" /></div>
          <div className="grid gap-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-10 w-full" /></div>
        </div>
        <div className="grid gap-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></div>
      </div>
    </div>
  );
}
