import { useState, useCallback } from "react";
import { MapPin, Navigation, Hash, MapPinned } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidCoordinate, isValidIndianPin } from "@/utils";
import type { CustomerLocation, LocationSource } from "@/types";

// ============================================================================
// LocationPickerModal
//
// Reusable customer-facing modal for selecting a delivery location.
// Three entry points:
//   1. "Use my current location" — browser geolocation → coordinates
//   2. "Enter PIN code" — 6-digit Indian PIN
//   3. "Enter address" — free-text address
//
// Does NOT call any external geocoding API.
// Does NOT perform serviceability checks.
// ============================================================================

interface LocationPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLocationSelected: (location: CustomerLocation) => void;
  /** Current location (for display). */
  currentLocation?: CustomerLocation | null;
}

type PickerMode = "choose" | "gps" | "pin" | "address";

export function LocationPickerModal({
  open,
  onOpenChange,
  onLocationSelected,
  currentLocation,
}: LocationPickerModalProps) {
  const [mode, setMode] = useState<PickerMode>("choose");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [addressText, setAddressText] = useState("");

  const reset = useCallback(() => {
    setMode("choose");
    setGpsError(null);
    setGpsLoading(false);
    setPin("");
    setPinError(null);
    setAddressText("");
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) reset();
      onOpenChange(nextOpen);
    },
    [onOpenChange, reset],
  );

  // --- GPS ---------------------------------------------------------------
  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser.");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLoading(false);
        const { latitude, longitude } = position.coords;
        if (!isValidCoordinate(latitude, longitude)) {
          setGpsError("Received invalid coordinates. Please try again.");
          return;
        }
        onLocationSelected({
          latitude,
          longitude,
          source: "browser" satisfies LocationSource,
          selectedAt: Date.now(),
        });
        handleOpenChange(false);
      },
      (error) => {
        setGpsLoading(false);
        if (error.code === error.PERMISSION_DENIED) {
          setGpsError("Location permission denied. Please enter PIN or address instead.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setGpsError("Location unavailable. Please enter PIN or address instead.");
        } else {
          setGpsError("Location request timed out. Please try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }, [onLocationSelected, handleOpenChange]);

  // --- PIN ----------------------------------------------------------------
  const handlePinSubmit = useCallback(() => {
    const trimmed = pin.trim();
    if (!isValidIndianPin(trimmed)) {
      setPinError("Please enter a valid 6-digit PIN code.");
      return;
    }
    // Store PIN as a location — coordinates will be resolved by future
    // serviceability phases (geocoding). Latitude/longitude omitted intentionally
    // to distinguish "no coordinates" from the geographic point (0,0).
    onLocationSelected({
      zipCode: trimmed,
      source: "manual" satisfies LocationSource,
      selectedAt: Date.now(),
    });
    handleOpenChange(false);
  }, [pin, onLocationSelected, handleOpenChange]);

  // --- Address ------------------------------------------------------------
  const handleAddressSubmit = useCallback(() => {
    const trimmed = addressText.trim();
    if (trimmed.length < 3) {
      return;
    }
    onLocationSelected({
      address: trimmed,
      source: "manual" satisfies LocationSource,
      selectedAt: Date.now(),
    });
    handleOpenChange(false);
  }, [addressText, onLocationSelected, handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {currentLocation ? "Change delivery location" : "Select delivery location"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Current location summary */}
          {currentLocation && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {currentLocation.zipCode
                ? `Current: PIN ${currentLocation.zipCode}`
                : currentLocation.address
                  ? `Current: ${currentLocation.address}`
                  : "Location set"}
            </div>
          )}

          {mode === "choose" && (
            <div className="space-y-2">
              {/* GPS Option */}
              <button
                type="button"
                onClick={() => {
                  setMode("gps");
                  handleUseCurrentLocation();
                }}
                className="flex w-full items-center gap-3 rounded-md border border-border px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <Navigation className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Use my current location</p>
                  <p className="text-xs text-muted-foreground">
                    Detect your location automatically
                  </p>
                </div>
              </button>

              {/* PIN Option */}
              <button
                type="button"
                onClick={() => setMode("pin")}
                className="flex w-full items-center gap-3 rounded-md border border-border px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <Hash className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Enter PIN code</p>
                  <p className="text-xs text-muted-foreground">
                    Enter your 6-digit area PIN code
                  </p>
                </div>
              </button>

              {/* Address Option */}
              <button
                type="button"
                onClick={() => setMode("address")}
                className="flex w-full items-center gap-3 rounded-md border border-border px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <MapPinned className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Enter address</p>
                  <p className="text-xs text-muted-foreground">
                    Type your delivery address
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* GPS loading / error */}
          {mode === "gps" && (
            <div className="space-y-3">
              {gpsLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Detecting location...
                </div>
              )}
              {gpsError && (
                <div className="space-y-3">
                  <p className="text-sm text-destructive">{gpsError}</p>
                  <Button variant="outline" size="sm" onClick={() => setMode("choose")}>
                    Go back
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* PIN input */}
          {mode === "pin" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="location-pin" className="text-sm">
                  PIN Code
                </Label>
                <Input
                  id="location-pin"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="e.g. 509001"
                  value={pin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setPin(v);
                    setPinError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handlePinSubmit();
                  }}
                  autoFocus
                />
                {pinError && (
                  <p className="mt-1 text-xs text-destructive">{pinError}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setMode("choose")}>
                  Back
                </Button>
                <Button size="sm" onClick={handlePinSubmit}>
                  Confirm
                </Button>
              </div>
            </div>
          )}

          {/* Address input */}
          {mode === "address" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="location-address" className="text-sm">
                  Delivery Address
                </Label>
                <Input
                  id="location-address"
                  type="text"
                  placeholder="House/Flat, Street, Area, City"
                  value={addressText}
                  onChange={(e) => setAddressText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddressSubmit();
                  }}
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setMode("choose")}>
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddressSubmit}
                  disabled={addressText.trim().length < 3}
                >
                  Confirm
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
