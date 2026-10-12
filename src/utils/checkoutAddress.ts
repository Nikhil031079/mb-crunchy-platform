// ============================================================================
// MB CRUNCHY — Checkout structured address helpers (UI-only)
//
// These helpers let the checkout form collect a structured delivery address
// (house/flat, street/locality, landmark, instructions, pincode) while
// preserving the existing order + Shiprocket payload contract:
//
//   deliveryAddress (orders.deliveryAddress, shipments.shippingAddress,
//     Shiprocket billing_address/shipping_address)
//       <- composeDeliveryAddress({ houseFlat, streetLocality, landmark })
//
//   deliveryNotes (orders.deliveryNotes)
//       <- composeDeliveryNotes({ landmark, deliveryInstructions })
//
// No Convex schema, order payload, or Shiprocket contract change is required.
// The server still receives the same string fields it validates today.
// ============================================================================

export interface StructuredAddressInput {
  houseFlat: string;
  streetLocality: string;
  landmark: string;
}

export interface DeliveryNotesInput {
  landmark: string;
  deliveryInstructions: string;
}

/**
 * Compose the single deliveryAddress string expected by orders.create,
 * order display, and the Shiprocket adapter from structured inputs.
 *
 * Format: "houseFlat, streetLocality[, Near landmark]"
 * Empty parts are omitted; surrounding whitespace is trimmed.
 */
export function composeDeliveryAddress(input: StructuredAddressInput): string {
  const house = input.houseFlat.trim();
  const street = input.streetLocality.trim();
  const landmark = input.landmark.trim();
  const parts: string[] = [];
  if (house) parts.push(house);
  if (street) parts.push(street);
  if (landmark) parts.push(`Near ${landmark}`);
  return parts.join(", ");
}

/**
 * Compose the deliveryNotes string expected by orders.create from the
 * optional landmark + free-form delivery instructions.
 *
 * Format preserves the historical "Landmark: X" prefix used when a saved
 * address carried a landmark, followed by the instructions on a new line.
 * Returns an empty string when neither is provided (caller sends undefined).
 */
export function composeDeliveryNotes(input: DeliveryNotesInput): string {
  const landmark = input.landmark.trim();
  const instructions = input.deliveryInstructions.trim();
  const parts: string[] = [];
  if (landmark) parts.push(`Landmark: ${landmark}`);
  if (instructions) parts.push(instructions);
  return parts.join("\n");
}

/**
 * Best-effort split of a legacy single-string saved address into the
 * structured house/street inputs. Saved addresses predate structured entry
 * and cannot be split reliably, so:
 *   - split on the FIRST comma when present (house = before, street = after)
 *   - otherwise the whole string becomes houseFlat and street stays empty
 *     so validation guides the customer to complete it.
 * Never throws; always returns trimmed strings.
 */
export function splitSavedAddress(address: string): {
  houseFlat: string;
  streetLocality: string;
} {
  const trimmed = (address ?? "").trim();
  if (!trimmed) return { houseFlat: "", streetLocality: "" };
  const comma = trimmed.indexOf(",");
  if (comma === -1) return { houseFlat: trimmed, streetLocality: "" };
  return {
    houseFlat: trimmed.slice(0, comma).trim(),
    // Strip leading comma debris from empty segments (e.g. "Flat,, Street"
    // yields street "Street", not ", Street") so recomposition never emits
    // a stray ", ," artifact. Interior commas are preserved verbatim.
    streetLocality: trimmed
      .slice(comma + 1)
      .replace(/^[\s,]+/, "")
      .trim(),
  };
}

/**
 * Optional-email check: empty (after trim) is valid; a non-empty value must
 * look like a deliverable address. Deliberately permissive — the server is
 * the authority and today accepts any string.
 */
export function isValidOptionalEmail(email: string): boolean {
  const trimmed = (email ?? "").trim();
  if (!trimmed) return true;
  if (trimmed.length > 254) return false;
  if (/\s/.test(trimmed)) return false;
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) {
    return false;
  }
  const domain = trimmed.slice(at + 1);
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return false;
  }
  return true;
}
