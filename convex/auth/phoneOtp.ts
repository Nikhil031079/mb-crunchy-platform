import { Phone } from "@convex-dev/auth/providers/Phone";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { readWhatsAppOtpConfig, sendWhatsAppOtp } from "./whatsappOtp";

/**
 * Phone OTP provider for customer authentication.
 *
 * Delivery order:
 *   1. WhatsApp Cloud API (authentication template) when configured. No DLT
 *      registration is needed. See ./whatsappOtp.ts for the variables.
 *   2. Optional HTTP endpoint fallback (for example an SMS gateway) when
 *      PHONE_OTP_API_ENDPOINT is set. Used if WhatsApp is not configured or
 *      the WhatsApp send fails.
 *
 * If neither is configured, sending fails loudly so OTPs are never silently lost.
 *
 * Fallback endpoint contract:
 *   POST { phone: string, otp: string, appName: string }
 *   Headers: { x-api-key: string } (only if PHONE_OTP_API_KEY is set)
 *   OTP_APP_NAME - app name passed to the endpoint (optional)
 */
export const phoneOtp = Phone({
  id: "phone",
  maxAge: 60 * 10, // 10 minutes (shorter than default 20 for better security)

  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },

  async sendVerificationRequest({ identifier: phone, token }) {
    const whatsApp = readWhatsAppOtpConfig(process.env);
    const apiEndpoint = process.env.PHONE_OTP_API_ENDPOINT;

    if (!whatsApp && !apiEndpoint) {
      throw new Error(
        "Phone OTP is not configured. Set the WHATSAPP_* variables (preferred) or PHONE_OTP_API_ENDPOINT.",
      );
    }

    let whatsAppError: unknown;
    if (whatsApp) {
      try {
        await sendWhatsAppOtp(whatsApp, phone, token);
        return;
      } catch (error) {
        whatsAppError = error;
        console.error("[phoneOtp]", error instanceof Error ? error.message : "WhatsApp OTP failed");
        if (!apiEndpoint) throw error;
      }
    }

    // Fallback: generic HTTP endpoint
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = process.env.PHONE_OTP_API_KEY;
    if (apiKey) headers["x-api-key"] = apiKey;

    const response = await fetch(apiEndpoint!, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone,
        otp: token,
        appName: process.env.OTP_APP_NAME || "MB Crunchy",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const prefix = whatsAppError ? "WhatsApp and fallback both failed. " : "";
      throw new Error(
        `${prefix}Failed to send OTP: ${response.status} ${response.statusText} - ${body}`,
      );
    }
  },
});
