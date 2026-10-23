// ============================================================================
// MB CRUNCHY - WhatsApp OTP delivery (Meta WhatsApp Cloud API)
//
// Sends the OTP with an approved *authentication* template that has a
// "copy code" button. Meta requires authentication templates to come from its
// template library, so create the template in WhatsApp Manager first.
//
// Environment variables (set with: npx convex env set NAME value):
//   WHATSAPP_ACCESS_TOKEN        permanent system-user token (secret)
//   WHATSAPP_PHONE_NUMBER_ID     phone-number ID from the Meta dashboard
//   WHATSAPP_OTP_TEMPLATE_NAME   approved authentication template name
//   WHATSAPP_TEMPLATE_LANG       template language code (default "en")
//   WHATSAPP_GRAPH_VERSION       Graph API version (default "v25.0")
//
// No Convex imports here on purpose: this file is unit-tested in isolation.
// ============================================================================

export interface WhatsAppOtpConfig {
  accessToken: string;
  phoneNumberId: string;
  templateName: string;
  languageCode: string;
  graphVersion: string;
}

export const DEFAULT_GRAPH_VERSION = "v25.0";

/** Returns null when WhatsApp OTP is not configured (so callers can fall back). */
export function readWhatsAppOtpConfig(
  env: Record<string, string | undefined>,
): WhatsAppOtpConfig | null {
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const templateName = env.WHATSAPP_OTP_TEMPLATE_NAME?.trim();
  if (!accessToken || !phoneNumberId || !templateName) return null;
  return {
    accessToken,
    phoneNumberId,
    templateName,
    languageCode: env.WHATSAPP_TEMPLATE_LANG?.trim() || "en",
    graphVersion: env.WHATSAPP_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION,
  };
}

/** Meta wants the number as country code + digits, no "+" (e.g. 919876543210). */
export function toWhatsAppRecipient(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const national = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!/^[6-9][0-9]{9}$/.test(national)) {
    throw new Error("Invalid Indian mobile number for WhatsApp OTP");
  }
  return `91${national}`;
}

export function buildWhatsAppOtpPayload(
  config: Pick<WhatsAppOtpConfig, "templateName" | "languageCode">,
  phone: string,
  code: string,
) {
  if (!/^[0-9]{4,8}$/.test(code)) {
    throw new Error("OTP must be 4-8 digits");
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toWhatsAppRecipient(phone),
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.languageCode },
      components: [
        // Body variable {{1}} = the code
        { type: "body", parameters: [{ type: "text", text: code }] },
        // "Copy code" button also needs the code (authentication template format)
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }],
        },
      ],
    },
  };
}

/**
 * Sends the OTP. Throws on any failure. The error text never includes the
 * access token (Meta's own error message is passed through for diagnosis).
 */
export async function sendWhatsAppOtp(
  config: WhatsAppOtpConfig,
  phone: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildWhatsAppOtpPayload(config, phone, code)),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = (await response.json()) as {
        error?: { message?: string; code?: number; error_subcode?: number };
      };
      const err = body.error;
      if (err) detail = ` (code ${err.code ?? "?"}${err.error_subcode ? `/${err.error_subcode}` : ""}: ${err.message ?? "unknown"})`;
    } catch {
      // body was not JSON; status alone is enough
    }
    throw new Error(`WhatsApp OTP failed: HTTP ${response.status}${detail}`);
  }
}
