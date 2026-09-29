// ============================================================================
// MB CRUNCHY - Shiprocket Adapter (Server-Side Only)
//
// Provides authenticated access to the Shiprocket API for Mart courier
// operations. All functions in this module run server-side only and must
// never be imported by client code.
//
// Environment variables required:
//   COURIER_SHIPROCKET_API_EMAIL     - Shiprocket account email
//   COURIER_SHIPROCKET_API_PASSWORD  - Shiprocket account password
//   COURIER_SHIPROCKET_WEBHOOK_SECRET - Webhook authentication secret
//   COURIER_DRY_RUN                  - "true" to skip real API calls
//
// This module is the ONLY place that should reference Shiprocket API
// endpoints, authentication, or request formatting.
// ============================================================================

import { normalizeShiprocketStatus } from "./shiprocketStatusMap";
import type { ShipmentStatus } from "./shipmentStatus";

// ============================================================================
// Configuration
// ============================================================================

export interface ShiprocketConfig {
  apiEmail: string;
  apiPassword: string;
  webhookSecret: string;
  dryRun: boolean;
  baseUrl: string;
}

/**
 * Load and validate Shiprocket configuration from environment variables.
 * Fails fast with a clear error if required config is missing.
 * Never logs credential values.
 */
export function loadShiprocketConfig(): ShiprocketConfig {
  const apiEmail = process.env.COURIER_SHIPROCKET_API_EMAIL;
  const apiPassword = process.env.COURIER_SHIPROCKET_API_PASSWORD;
  const webhookSecret = process.env.COURIER_SHIPROCKET_WEBHOOK_SECRET;
  const dryRun = process.env.COURIER_DRY_RUN === "true";
  const baseUrl =
    process.env.COURIER_SHIPROCKET_BASE_URL ?? "https://apiv2.shiprocket.in/v1/external";

  const missing: string[] = [];
  if (!apiEmail) missing.push("COURIER_SHIPROCKET_API_EMAIL");
  if (!apiPassword) missing.push("COURIER_SHIPROCKET_API_PASSWORD");

  if (missing.length > 0) {
    throw new Error(
      `[shiprocket] Missing required configuration: ${missing.join(", ")}`,
    );
  }

  return {
    apiEmail: apiEmail!,
    apiPassword: apiPassword!,
    webhookSecret: webhookSecret ?? "",
    dryRun,
    baseUrl,
  };
}

// ============================================================================
// Authentication
// ============================================================================

export interface AuthToken {
  token: string;
  expiresAt: number;
}

/**
 * Authenticate with Shiprocket and obtain a bearer token.
 * In dry-run mode, returns a mock token without calling the API.
 */
export async function authenticate(
  config: ShiprocketConfig,
): Promise<AuthToken> {
  if (config.dryRun) {
    return {
      token: "dry-run-token",
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  }

  const response = await fetch(`${config.baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: config.apiEmail,
      password: config.apiPassword,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `[shiprocket] Authentication failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    token?: string;
    expires_at?: string;
  };

  if (!data.token) {
    throw new Error("[shiprocket] Authentication response missing token");
  }

  return {
    token: data.token,
    expiresAt: data.expires_at
      ? new Date(data.expires_at).getTime()
      : Date.now() + 24 * 60 * 60 * 1000,
  };
}

// ============================================================================
// API Helpers
// ============================================================================

async function apiGet<T>(
  config: ShiprocketConfig,
  token: string,
  path: string,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `[shiprocket] GET ${path} failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ""}`,
    );
  }

  return (await response.json()) as T;
}

async function apiPost<T>(
  config: ShiprocketConfig,
  token: string,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      `[shiprocket] POST ${path} failed: ${response.status} ${response.statusText}${responseBody ? ` - ${responseBody}` : ""}`,
    );
  }

  return (await response.json()) as T;
}

// ============================================================================
// Types (Shiprocket API request/response shapes)
// ============================================================================

export interface ShiprocketOrderRequest {
  order_id: string;
  order_date: string;
  pickup_location: string;
  billing_customer_name: string;
  billing_address: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_phone: string;
  shipping_customer_name: string;
  shipping_address: string;
  shipping_city: string;
  shipping_pincode: string;
  shipping_state: string;
  shipping_country: string;
  shipping_phone: string;
  order_items: Array<{
    name: string;
    sku: string;
    units: number;
    selling_price: number;
    hsn?: number;
  }>;
  payment_method: string;
  sub_total: number;
  length?: number;
  breadth?: number;
  height?: number;
  weight?: number;
}

export interface ShiprocketOrderResponse {
  order_id: number;
  shipment_id: number;
  status: string;
  status_code: number;
}

export interface ShiprocketAwbRequest {
  shipment_id: number[];
  courier_id: number;
}

export interface ShiprocketAwbResponse {
  response: Array<{
    awb_code: string;
    courier_company_id: number;
    courier_name: string;
    shipment_id: number;
  }>;
  response_data?: string;
  status_code?: number;
}

export interface ShiprocketTrackingResponse {
  tracking_data?: {
    shiprocket_order_id?: number;
    awb?: string;
    current_status?: string;
    current_status_id?: number;
    etd?: string;
    scans?: Array<{
      location: string;
      activity: string;
      date: string;
      time: string;
    }>;
  };
  status_code?: number;
}

// ============================================================================
// Adapter Operations (Foundation)
//
// Phase 34A implements the interface and dry-run paths only.
// Actual booking logic connects in Phase 34B/34C.
// ============================================================================

export type AdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };

/**
 * Create a Shiprocket order.
 * Phase 34A: Interface + dry-run only.
 */
export async function createShiprocketOrder(
  config: ShiprocketConfig,
  token: string,
  order: ShiprocketOrderRequest,
): Promise<AdapterResult<ShiprocketOrderResponse>> {
  if (config.dryRun) {
    return {
      ok: true,
      data: {
        order_id: Math.floor(Math.random() * 1000000),
        shipment_id: Math.floor(Math.random() * 1000000),
        status: "draft",
        status_code: 6,
      },
    };
  }

  try {
    const result = await apiPost<ShiprocketOrderResponse>(
      config, token, "/orders/create/adhoc", order,
    );
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Assign an AWB to a shipment.
 * Phase 34A: Interface + dry-run only.
 */
export async function assignAwb(
  config: ShiprocketConfig,
  token: string,
  request: ShiprocketAwbRequest,
): Promise<AdapterResult<ShiprocketAwbResponse>> {
  if (config.dryRun) {
    return {
      ok: true,
      data: {
        response: [{
          awb_code: `DRY${Date.now().toString(36).toUpperCase()}`,
          courier_company_id: 0,
          courier_name: "dry-run-courier",
          shipment_id: request.shipment_id[0] ?? 0,
        }],
      },
    };
  }

  try {
    const result = await apiPost<ShiprocketAwbResponse>(
      config, token, "/courier/assign/awb", request,
    );
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Fetch tracking information for a shipment by AWB.
 * Phase 34A: Interface + dry-run only.
 */
export async function trackShipment(
  config: ShiprocketConfig,
  token: string,
  awbNumber: string,
): Promise<AdapterResult<ShiprocketTrackingResponse>> {
  if (config.dryRun) {
    return {
      ok: true,
      data: {
        tracking_data: {
          awb: awbNumber,
          current_status: "pending",
          current_status_id: 6,
        },
      },
    };
  }

  try {
    const result = await apiGet<ShiprocketTrackingResponse>(
      config, token, `/courier/track/awb/${awbNumber}`,
    );
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Verify a Shiprocket webhook signature.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyWebhookSignature(
  config: ShiprocketConfig,
  _rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!config.webhookSecret || !signatureHeader) return false;
  const a = config.webhookSecret;
  const b = signatureHeader;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Parse a raw Shiprocket webhook body and normalize the status.
 */
export function parseWebhookEvent(rawBody: string): AdapterResult<{
  shipmentId?: number;
  orderId?: number;
  awb?: string;
  statusId?: number;
  status: ShipmentStatus;
  statusDescription?: string;
}> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Invalid JSON payload" };
  }

  const statusId = parsed.status_id as number | undefined;
  const awb = parsed.awb as string | undefined;
  const shipmentId = parsed.shipment_id as number | undefined;
  const orderId = parsed.order_id as number | undefined;
  const statusDescription = parsed.status as string | undefined;

  const normalizedStatus = normalizeShiprocketStatus(
    statusId ?? statusDescription ?? "",
  );

  if (!normalizedStatus) {
    return {
      ok: false,
      error: `Unknown Shiprocket status: ${String(statusId ?? statusDescription)}`,
      code: "UNKNOWN_STATUS",
    };
  }

  return {
    ok: true,
    data: {
      shipmentId,
      orderId,
      awb,
      statusId,
      status: normalizedStatus,
      statusDescription,
    },
  };
}
