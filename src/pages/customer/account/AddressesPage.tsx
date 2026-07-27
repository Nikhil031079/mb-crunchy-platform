import { useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { MapPin, Plus, Pencil, Trash2, Star, Loader2 } from "lucide-react";

import { api } from "@convex/_generated/api";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { AddressFormDialog } from "@/components/customer/account/AddressFormDialog";
import { EmptyState } from "@/components/shared/EmptyState";

import type { CustomerAddress } from "@/types";

export default function AddressesPage() {
  const customer = useQuery(api.customers.getByAuthUser, {});
  const addresses = useQuery(
    api.addresses.getByCustomer,
    customer ? { customerId: customer._id } : "skip",
  ) as CustomerAddress[] | undefined;

  const deleteAddress = useMutation(api.addresses.softDelete);
  const setDefault = useMutation(api.addresses.setDefault);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);

  const handleAdd = useCallback(() => {
    setEditingAddress(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((address: CustomerAddress) => {
    setEditingAddress(address);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteAddress({ id: id as any });
        toast.success("Address deleted");
      } catch {
        toast.error("Failed to delete address");
      }
    },
    [deleteAddress],
  );

  const handleSetDefault = useCallback(
    async (id: string) => {
      try {
        await setDefault({ id: id as any });
        toast.success("Default address updated");
      } catch {
        toast.error("Failed to update default address");
      }
    },
    [setDefault],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Saved Addresses
            </CardTitle>
            <Button size="sm" onClick={handleAdd} className="gap-1">
              <Plus className="h-3 w-3" />
              Add Address
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {addresses === undefined ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : addresses.length === 0 ? (
            <EmptyState
              title="No saved addresses"
              description="Add a delivery address for faster checkout."
              icon={MapPin}
              action={
                <Button size="sm" onClick={handleAdd}>
                  Add Address
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {addresses.map((addr) => (
                <div
                  key={addr._id}
                  className="rounded-lg border border-border/60 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{addr.label}</span>
                        {addr.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{addr.address}</p>
                      {addr.city && (
                        <p className="text-xs text-muted-foreground">
                          {[addr.city, addr.state, addr.zipCode].filter(Boolean).join(", ")}
                        </p>
                      )}
                      {addr.landmark && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Landmark:</span> {addr.landmark}
                        </p>
                      )}
                      {addr.deliveryInstructions && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Instructions:</span>{" "}
                          {addr.deliveryInstructions}
                        </p>
                      )}
                      {addr.deliveryZone && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Zone:</span> {addr.deliveryZone}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!addr.isDefault && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleSetDefault(addr._id)}
                          title="Set as default"
                        >
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(addr)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(addr._id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddressFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        address={editingAddress}
        customerId={customer?._id}
      />
    </div>
  );
}
