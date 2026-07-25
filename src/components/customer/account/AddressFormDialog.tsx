import { useState, useEffect, useCallback } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { api } from "@convex/_generated/api";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

import { cn } from "@/lib/utils";

import type { CustomerAddress } from "@/types";

interface AddressFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address?: CustomerAddress | null;
  customerId?: string;
}

interface FormErrors {
  label?: string;
  address?: string;
  zipCode?: string;
}

export function AddressFormDialog({
  open,
  onOpenChange,
  address,
  customerId,
}: AddressFormDialogProps) {
  const createAddress = useMutation(api.addresses.create);
  const updateAddress = useMutation(api.addresses.update);

  const [label, setLabel] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [landmark, setLandmark] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [deliveryZone, setDeliveryZone] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!address;

  useEffect(() => {
    if (open) {
      if (address) {
        setLabel(address.label);
        setStreetAddress(address.address);
        setCity(address.city ?? "");
        setState(address.state ?? "");
        setZipCode(address.zipCode ?? "");
        setLandmark(address.landmark ?? "");
        setDeliveryInstructions(address.deliveryInstructions ?? "");
        setDeliveryZone(address.deliveryZone ?? "");
        setIsDefault(address.isDefault);
      } else {
        setLabel("");
        setStreetAddress("");
        setCity("");
        setState("");
        setZipCode("");
        setLandmark("");
        setDeliveryInstructions("");
        setDeliveryZone("");
        setIsDefault(false);
      }
      setErrors({});
    }
  }, [open, address]);

  const validate = useCallback(() => {
    const newErrors: FormErrors = {};
    if (!label.trim() || label.trim().length < 2) {
      newErrors.label = "Label must be at least 2 characters";
    }
    if (!streetAddress.trim() || streetAddress.trim().length < 5) {
      newErrors.address = "Address must be at least 5 characters";
    }
    if (zipCode.trim() && !/^[a-zA-Z0-9]{4,10}$/.test(zipCode.trim())) {
      newErrors.zipCode = "ZIP/Pincode must be 4-10 alphanumeric characters";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [label, streetAddress, zipCode]);

  const handleSave = useCallback(async () => {
    if (!validate() || !customerId) return;
    setIsSaving(true);
    try {
      const data = {
        customerId: customerId as any,
        label: label.trim(),
        address: streetAddress.trim(),
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zipCode: zipCode.trim() || undefined,
        landmark: landmark.trim() || undefined,
        deliveryInstructions: deliveryInstructions.trim() || undefined,
        deliveryZone: deliveryZone.trim() || undefined,
        isDefault,
      };

      if (isEditing && address) {
        const { customerId: _customerId, ...updateData } = data;
        await updateAddress({ id: address._id as any, ...updateData });
        toast.success("Address updated");
      } else {
        await createAddress(data);
        toast.success("Address added");
      }
      onOpenChange(false);
    } catch {
      toast.error(isEditing ? "Failed to update address" : "Failed to add address");
    } finally {
      setIsSaving(false);
    }
  }, [
    validate,
    customerId,
    label,
    streetAddress,
    city,
    state,
    zipCode,
    landmark,
    deliveryInstructions,
    deliveryZone,
    isDefault,
    isEditing,
    address,
    createAddress,
    updateAddress,
    onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Address" : "Add Address"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="addr-label">
              Label <span className="text-destructive">*</span>
            </Label>
            <Input
              id="addr-label"
              placeholder="Home, Office, etc."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={cn(errors.label && "border-destructive")}
            />
            {errors.label && <p className="text-xs text-destructive">{errors.label}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr-street">
              Address <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="addr-street"
              placeholder="Street address, building, apartment..."
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              className={cn("min-h-[80px]", errors.address && "border-destructive")}
            />
            {errors.address && <p className="text-xs text-destructive">{errors.address}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="addr-city">City</Label>
              <Input
                id="addr-city"
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr-state">State</Label>
              <Input
                id="addr-state"
                placeholder="State"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr-zip">ZIP / Pincode</Label>
            <Input
              id="addr-zip"
              placeholder="4-digit or alphanumeric"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              className={cn(errors.zipCode && "border-destructive")}
            />
            {errors.zipCode && <p className="text-xs text-destructive">{errors.zipCode}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr-landmark">Landmark</Label>
            <Input
              id="addr-landmark"
              placeholder="Near park, opposite mall, etc."
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr-zone">Delivery Zone</Label>
            <Input
              id="addr-zone"
              placeholder="e.g. Zone A, Central, etc."
              value={deliveryZone}
              onChange={(e) => setDeliveryZone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addr-instructions">Delivery Instructions</Label>
            <Textarea
              id="addr-instructions"
              placeholder="Gate code, floor number, call on arrival..."
              value={deliveryInstructions}
              onChange={(e) => setDeliveryInstructions(e.target.value)}
              className="min-h-[60px]"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="addr-default"
              checked={isDefault}
              onCheckedChange={setIsDefault}
            />
            <Label htmlFor="addr-default" className="cursor-pointer">
              Set as default address
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? "Save Changes" : "Add Address"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
