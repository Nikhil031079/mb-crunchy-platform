// ============================================================================
// MB CRUNCHY - Notification Service
// Reusable outbound-notification infrastructure. Business logic calls notify()
// with a typed payload; concrete providers (Telegram, WhatsApp, Email, Push)
// are swappable without touching order logic.
// ============================================================================

import type { Id } from "./_generated/dataModel";

// ============================================================================
// Notification Types
// ============================================================================

export const NOTIFICATION_TYPES = [
  "NEW_ORDER",
  "PAYMENT_PENDING",
  "PAYMENT_CONFIRMED",
  "ORDER_CANCELLED",
  "ORDER_REFUNDED",
  "LOW_STOCK",
  "DAILY_SUMMARY",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// ============================================================================
// Typed Payloads
// ============================================================================

export interface NewOrderPayload {
  orderId: Id<"orders">;
  orderNumber: string;
  businessUnitName: string;
  orderType: "delivery" | "pickup";
  total: number;
  itemCount: number;
  customerName: string;
}

export interface PaymentPendingPayload {
  orderId: Id<"orders">;
  orderNumber: string;
  paymentMethod?: string;
  total: number;
}

export interface PaymentConfirmedPayload {
  orderId: Id<"orders">;
  orderNumber: string;
  total: number;
}

export interface OrderCancelledPayload {
  orderId: Id<"orders">;
  orderNumber: string;
  reason?: string;
}

export interface OrderRefundedPayload {
  orderId: Id<"orders">;
  orderNumber: string;
  amount?: number;
}

export interface LowStockPayload {
  inventoryId: Id<"inventory">;
  catalogItemId: Id<"catalogItems">;
  businessUnitId: Id<"businessUnits">;
  itemName: string;
  variantName: string;
  stockQuantity: number;
}

export interface DailySummaryPayload {
  businessUnitId: Id<"businessUnits">;
  businessUnitName: string;
  date: string;
  totalOrders: number;
  totalRevenue: number;
}

export interface NotificationPayloadMap {
  NEW_ORDER: NewOrderPayload;
  PAYMENT_PENDING: PaymentPendingPayload;
  PAYMENT_CONFIRMED: PaymentConfirmedPayload;
  ORDER_CANCELLED: OrderCancelledPayload;
  ORDER_REFUNDED: OrderRefundedPayload;
  LOW_STOCK: LowStockPayload;
  DAILY_SUMMARY: DailySummaryPayload;
}

export type NotificationPayload<T extends NotificationType> =
  NotificationPayloadMap[T];

// ============================================================================
// Severity
// ============================================================================

export const SEVERITY = ["INFO", "SUCCESS", "WARNING", "CRITICAL"] as const;

export type Severity = (typeof SEVERITY)[number];

// ============================================================================
// Notification Template Engine
// Reusable, provider-independent layer. renderNotification(type, payload)
// produces clean plain-text output for any future provider (Telegram,
// WhatsApp, Email) without touching business logic.
// ============================================================================

export interface RenderedNotification {
  title: string;
  message: string;
  severity: Severity;
}

export type NotificationTemplate<T extends NotificationType> = (
  payload: NotificationPayload<T>
) => RenderedNotification;

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const newOrderTemplate: NotificationTemplate<"NEW_ORDER"> = (payload) => ({
  title: "New Order",
  message: [
    `Order #${payload.orderNumber}`,
    `Customer: ${payload.customerName}`,
    `Amount: ${formatINR(payload.total)}`,
    `Type: ${titleCase(payload.orderType)}`,
    `Items: ${payload.itemCount}`,
    `Business Unit: ${payload.businessUnitName}`,
  ].join("\n"),
  severity: "INFO",
});

const paymentPendingTemplate: NotificationTemplate<"PAYMENT_PENDING"> = (
  payload
) => {
  const lines = [
    `Order #${payload.orderNumber}`,
    `Amount: ${formatINR(payload.total)}`,
  ];
  if (payload.paymentMethod) {
    lines.push(`Payment Method: ${payload.paymentMethod}`);
  }
  return {
    title: "Payment Pending",
    message: lines.join("\n"),
    severity: "WARNING",
  };
};

const paymentConfirmedTemplate: NotificationTemplate<"PAYMENT_CONFIRMED"> = (
  payload
) => ({
  title: "Payment Confirmed",
  message: [
    `Order #${payload.orderNumber}`,
    `Amount: ${formatINR(payload.total)}`,
  ].join("\n"),
  severity: "SUCCESS",
});

const orderCancelledTemplate: NotificationTemplate<"ORDER_CANCELLED"> = (
  payload
) => {
  const lines = [`Order #${payload.orderNumber}`];
  if (payload.reason) {
    lines.push(`Reason: ${payload.reason}`);
  }
  return {
    title: "Order Cancelled",
    message: lines.join("\n"),
    severity: "WARNING",
  };
};

const orderRefundedTemplate: NotificationTemplate<"ORDER_REFUNDED"> = (
  payload
) => {
  const lines = [`Order #${payload.orderNumber}`];
  if (payload.amount !== undefined) {
    lines.push(`Refunded Amount: ${formatINR(payload.amount)}`);
  }
  return {
    title: "Order Refunded",
    message: lines.join("\n"),
    severity: "INFO",
  };
};

const lowStockTemplate: NotificationTemplate<"LOW_STOCK"> = (payload) => ({
  title: "Low Stock Alert",
  message: [
    `Item: ${payload.itemName}`,
    `Variant: ${payload.variantName}`,
    `Stock Quantity: ${payload.stockQuantity}`,
  ].join("\n"),
  severity: "CRITICAL",
});

const dailySummaryTemplate: NotificationTemplate<"DAILY_SUMMARY"> = (payload) => ({
  title: "Daily Summary",
  message: [
    `Business Unit: ${payload.businessUnitName}`,
    `Date: ${payload.date}`,
    `Total Orders: ${payload.totalOrders}`,
    `Total Revenue: ${formatINR(payload.totalRevenue)}`,
  ].join("\n"),
  severity: "INFO",
});

const TEMPLATES: { [T in NotificationType]: NotificationTemplate<T> } = {
  NEW_ORDER: newOrderTemplate,
  PAYMENT_PENDING: paymentPendingTemplate,
  PAYMENT_CONFIRMED: paymentConfirmedTemplate,
  ORDER_CANCELLED: orderCancelledTemplate,
  ORDER_REFUNDED: orderRefundedTemplate,
  LOW_STOCK: lowStockTemplate,
  DAILY_SUMMARY: dailySummaryTemplate,
};

export function renderNotification<T extends NotificationType>(
  type: T,
  payload: NotificationPayload<T>
): RenderedNotification {
  return TEMPLATES[type](payload);
}

// ============================================================================
// Provider Abstraction (replaceable transport)
// ============================================================================

export type NotificationFailureReason =
  | "not_configured"
  | "invalid_token"
  | "invalid_chat"
  | "telegram_error"
  | "network_error"
  | "send_failed";

export interface NotificationSendResult {
  delivered: boolean;
  provider: string;
  reason?: NotificationFailureReason;
}

export interface NotificationProvider {
  readonly name: string;
  isConfigured(): boolean;
  send<T extends NotificationType>(
    type: T,
    payload: NotificationPayload<T>
  ): Promise<NotificationSendResult>;
}

// ============================================================================
// Telegram Provider (Telegram Bot API transport)
// ============================================================================

const TELEGRAM_API_BASE = "https://api.telegram.org";

const TELEGRAM_BOT_TOKEN_PATTERN = /^\d{1,10}:[A-Za-z0-9_-]{35,}$/;
const TELEGRAM_CHAT_ID_PATTERN = /^(@[A-Za-z0-9_]{5,32}|-?\d{1,20})$/;

type TelegramConfig =
  | { ok: true; token: string; chatId: string }
  | { ok: false; reason: NotificationFailureReason };

function resolveTelegramConfig(): TelegramConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, reason: "not_configured" };
  }
  if (!TELEGRAM_BOT_TOKEN_PATTERN.test(token)) {
    return { ok: false, reason: "invalid_token" };
  }
  if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId)) {
    return { ok: false, reason: "invalid_chat" };
  }
  return { ok: true, token, chatId };
}

export class TelegramProvider implements NotificationProvider {
  readonly name = "telegram";

  isConfigured(): boolean {
    return resolveTelegramConfig().ok;
  }

  async send<T extends NotificationType>(
    type: T,
    payload: NotificationPayload<T>
  ): Promise<NotificationSendResult> {
    const config = resolveTelegramConfig();
    if (!config.ok) {
      return { delivered: false, provider: this.name, reason: config.reason };
    }

    const rendered = renderNotification(type, payload);
    const text = [
      "🍔 MB Crunchy",
      "",
      rendered.title,
      "",
      rendered.message,
      "",
      `Severity: ${rendered.severity}`,
      "",
      "MB Crunchy Notification",
    ].join("\n");

    let response: Response;
    try {
      response = await fetch(
        `${TELEGRAM_API_BASE}/bot${config.token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: config.chatId,
            text,
          }),
        }
      );
    } catch {
      return { delivered: false, provider: this.name, reason: "network_error" };
    }

    let body: { ok?: boolean; description?: string };
    try {
      body = (await response.json()) as { ok?: boolean; description?: string };
    } catch {
      return { delivered: false, provider: this.name, reason: "telegram_error" };
    }

    if (response.ok && body.ok) {
      return { delivered: true, provider: this.name };
    }

    const description = body.description ?? "";
    if (response.status === 401 || /unauthorized/i.test(description)) {
      return { delivered: false, provider: this.name, reason: "invalid_token" };
    }
    if (/chat not found/i.test(description)) {
      return { delivered: false, provider: this.name, reason: "invalid_chat" };
    }
    return { delivered: false, provider: this.name, reason: "telegram_error" };
  }
}

// ============================================================================
// Notification Service
// ============================================================================

export class NotificationService {
  private readonly providers: NotificationProvider[];

  constructor(providers: NotificationProvider[] = [new TelegramProvider()]) {
    this.providers = providers;
  }

  register(provider: NotificationProvider): void {
    this.providers.push(provider);
  }

  async notify<T extends NotificationType>(
    type: T,
    payload: NotificationPayload<T>
  ): Promise<NotificationSendResult[]> {
    const results: NotificationSendResult[] = [];
    for (const provider of this.providers) {
      let result: NotificationSendResult;
      try {
        result = await provider.send(type, payload);
      } catch {
        result = {
          delivered: false,
          provider: provider.name,
          reason: "send_failed",
        };
      }
      if (!result.delivered) {
        console.error(
          `[mb-notification] ${type} via ${provider.name} failed: ${result.reason ?? "unknown"}`
        );
      }
      results.push(result);
    }
    return results;
  }
}

export const notificationService = new NotificationService();

export async function notify<T extends NotificationType>(
  type: T,
  payload: NotificationPayload<T>
): Promise<NotificationSendResult[]> {
  return notificationService.notify(type, payload);
}

export async function sendTestNotification(): Promise<NotificationSendResult[]> {
  return notificationService.notify("NEW_ORDER", {
    orderId: "" as Id<"orders">,
    orderNumber: "TEST",
    businessUnitName: "MB Crunchy",
    orderType: "delivery",
    total: 0,
    itemCount: 0,
    customerName: "Configuration Test",
  });
}
