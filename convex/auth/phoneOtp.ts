import { Phone } from "@convex-dev/auth/providers/Phone";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/**
 * Phone OTP provider for customer authentication.
 *
 * Uses @convex-dev/auth's built-in Phone provider.
 * SMS delivery is handled via a configurable HTTP endpoint.
 *
 * Environment variables:
 *   PHONE_OTP_API_ENDPOINT — URL that accepts POST with { phone, otp, appName }
 *   PHONE_OTP_API_KEY      — API key for the SMS endpoint (sent as x-api-key header)
 *   VLY_APP_NAME           — App name displayed in SMS (optional)
 *
 * The endpoint must accept:
 *   POST { phone: string, otp: string, appName: string }
 *   Headers: { x-api-key: string }
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
    const apiEndpoint = process.env.PHONE_OTP_API_ENDPOINT;
    const apiKey = process.env.PHONE_OTP_API_KEY;

    if (!apiEndpoint) {
      throw new Error(
        "Phone OTP is not configured. Set PHONE_OTP_API_ENDPOINT environment variable.",
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone,
        otp: token,
        appName: process.env.VLY_APP_NAME || "MB Crunchy",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Failed to send OTP: ${response.status} ${response.statusText} — ${body}`,
      );
    }
  },
});
