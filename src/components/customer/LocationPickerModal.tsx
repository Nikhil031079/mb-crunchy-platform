import { useState, useCallback } from "react";
import { MapPin, Navigation, Hash, MapPinned, Loader2, Check, ChevronRight } from "lucide-react";
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
import { useGeocodingService } from "@/services/geocoding";
import type { GeocodeResult } from "@/services/geocoding";
import type { CustomerLocation, LocationSource } from "@/types";

// ============================================================================
// LocationPickerModal
//
// Reusable customer-facing modal for selecting a delivery location.
// Three entry points:
//   1. "Use my current location" — browser geolocation → coordinates
//   2. "Enter PIN code" — 6-digit Indian PIN → server geocoding → coordinates
//   3. "Enter address" — free-text address → server geocoding → coordinates
//
// Geocoding is performed server-side via Convex actions.
// ============================================================================

interface LocationPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLocationSelected: (location: CustomerLocation) => void;
  /** Current location (for display). */
  currentLocation?: CustomerLocation | null;
}

type PickerMode = "choose" | "gps" | "pin" | "pin-confirm" | "address" | "address-select";

export function LocationPickerModal({
  open,
  onOpenChange,
  onLocationSelected,
  currentLocation,
}: LocationPickerModalProps) {
  const { geocodePincode, geocodeAddress } = useGeocodingService();

  const [mode, setMode] = useState<PickerMode>("choose");

  // GPS state
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // PIN state
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinResult, setPinResult] = useState<GeocodeResult | null>(null);

  // Address state
  const [addressText, setAddressText] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressResults, setAddressResults] = useState<GeocodeResult[]>([]);

  const reset = useCallback(() => {
    setMode("choose");
    setGpsError(null);
    setGpsLoading(false);
    setPin("");
    setPinError(null);
    setPinLoading(false);
    setPinResult(null);
    setAddressText("");
    setAddressError(null);
    setAddressLoading(false);
    setAddressResults([]);
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
          resolution: "gps",
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

  // --- PIN: submit → geocode → show confirmation --------------------------
  const handlePinSubmit = useCallback(async () => {
    const trimmed = pin.trim();
    if (!isValidIndianPin(trimmed)) {
      setPinError("Please enter a valid 6-digit PIN code.");
      return;
    }

    setPinLoading(true);
    setPinError(null);

    try {
      const result = await geocodePincode(trimmed);
      setPinResult(result);
      setMode("pin-confirm");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Location service unavailable. Please use GPS.";
      setPinError(msg);
    } finally {
      setPinLoading(false);
    }
  }, [pin, geocodePincode]);

  // --- PIN: confirm result → save location --------------------------------
  const handlePinConfirm = useCallback(() => {
    if (!pinResult) return;
    const trimmed = pin.trim();
    onLocationSelected({
      zipCode: trimmed,
      latitude: pinResult.latitude,
      longitude: pinResult.longitude,
      city: pinResult.city,
      state: pinResult.state,
      address: pinResult.formattedAddress,
      source: "manual" satisfies LocationSource,
      resolution: "pincode",
      selectedAt: Date.now(),
    });
    handleOpenChange(false);
  }, [pin, pinResult, onLocationSelected, handleOpenChange]);

  // --- Address: submit → geocode → show results ---------------------------
  const handleAddressSubmit = useCallback(async () => {
    const trimmed = addressText.trim();
    if (trimmed.length < 5) {
      setAddressError("Please enter a more complete address (at least 5 characters).");
      return;
    }

    setAddressLoading(true);
    setAddressError(null);

    try {
      const results = await geocodeAddress(trimmed);
      if (results.length === 1) {
        // Single result — save directly
        onLocationSelected({
          address: trimmed,
          latitude: results[0].latitude,
          longitude: results[0].longitude,
          zipCode: results[0].zipCode,
          city: results[0].city,
          state: results[0].state,
          source: "address" satisfies LocationSource,
          resolution: "address",
          selectedAt: Date.now(),
        });
        handleOpenChange(false);
      } else {
        // Multiple results — let customer choose
        setAddressResults(results);
        setMode("address-select");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Location service unavailable. Please use GPS.";
      setAddressError(msg);
    } finally {
      setAddressLoading(false);
    }
  }, [addressText, geocodeAddress, onLocationSelected, handleOpenChange]);

  // --- Address: select a result → save location ---------------------------
  const handleAddressSelect = useCallback(
    (result: GeocodeResult) => {
      const trimmed = addressText.trim();
      onLocationSelected({
        address: trimmed,
        latitude: result.latitude,
        longitude: result.longitude,
        zipCode: result.zipCode,
        city: result.city,
        state: result.state,
        source: "address" satisfies LocationSource,
        resolution: "address",
        selectedAt: Date.now(),
      });
      handleOpenChange(false);
    },
    [addressText, onLocationSelected, handleOpenChange],
  );

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

          {/* ========== CHOOSE MODE ========== */}
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

          {/* ========== GPS MODE ========== */}
          {mode === "gps" && (
            <div className="space-y-3">
              {gpsLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
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

          {/* ========== PIN INPUT MODE ========== */}
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
                    if (e.key === "Enter" && !pinLoading) handlePinSubmit();
                  }}
                  disabled={pinLoading}
                  autoFocus
                />
                {pinError && (
                  <p className="mt-1 text-xs text-destructive">{pinError}</p>
                )}
              </div>
              {pinLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Finding location...
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setMode("choose")} disabled={pinLoading}>
                  Back
                </Button>
                <Button size="sm" onClick={handlePinSubmit} disabled={pinLoading || pin.trim().length < 6}>
                  {pinLoading ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Find Location
                </Button>
              </div>
            </div>
          )}

          {/* ========== PIN CONFIRM MODE ========== */}
          {mode === "pin-confirm" && pinResult && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <p className="text-sm font-medium">Location found for PIN {pin}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {pinResult.formattedAddress}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                This is an approximate location based on your PIN code. For more precise delivery, consider using GPS or entering your full address.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setMode("pin"); setPinResult(null); }}>
                  Back
                </Button>
                <Button size="sm" onClick={handlePinConfirm}>
                  <Check className="mr-1 h-3 w-3" />
                  Use This Location
                </Button>
              </div>
            </div>
          )}

          {/* ========== ADDRESS INPUT MODE ========== */}
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
                  onChange={(e) => {
                    setAddressText(e.target.value);
                    setAddressError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !addressLoading) handleAddressSubmit();
                  }}
                  disabled={addressLoading}
                  autoFocus
                />
                {addressError && (
                  <p className="mt-1 text-xs text-destructive">{addressError}</p>
                )}
              </div>
              {addressLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Finding location...
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setMode("choose")} disabled={addressLoading}>
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddressSubmit}
                  disabled={addressLoading || addressText.trim().length < 5}
                >
                  {addressLoading ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  Find Location
                </Button>
              </div>
            </div>
          )}

          {/* ========== ADDRESS SELECT MODE ========== */}
          {mode === "address-select" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Multiple locations found. Select the correct one:</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {addressResults.map((result, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAddressSelect(result)}
                    className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{result.formattedAddress}</p>
                      {result.city && result.state && (
                        <p className="text-xs text-muted-foreground">{result.city}, {result.state}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setMode("address"); setAddressResults([]); }}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
