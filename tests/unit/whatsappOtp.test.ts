import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GRAPH_VERSION,
  buildWhatsAppOtpPayload,
  readWhatsAppOtpConfig,
  sendWhatsAppOtp,
  toWhatsAppRecipient,
} from "../../convex/auth/whatsappOtp";

const config = {
  accessToken: "SECRET_TOKEN_123",
  phoneNumberId: "555000111",
  templateName: "mb_login_code",
  languageCode: "en",
  graphVersion: "v25.0",
};

describe("readWhatsAppOtpConfig", () => {
  it("returns null unless all three required variables are set", () => {
    expect(readWhatsAppOtpConfig({})).toBeNull();
    expect(readWhatsAppOtpConfig({ WHATSAPP_ACCESS_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1" })).toBeNull();
  });
  it("applies defaults for language and version", () => {
    const cfg = readWhatsAppOtpConfig({
      WHATSAPP_ACCESS_TOKEN: "t",
      WHATSAPP_PHONE_NUMBER_ID: "1",
      WHATSAPP_OTP_TEMPLATE_NAME: "tpl",
    });
    expect(cfg?.languageCode).toBe("en");
    expect(cfg?.graphVersion).toBe(DEFAULT_GRAPH_VERSION);
  });
});

describe("toWhatsAppRecipient", () => {
  it("normalizes +91, spaces and bare 10-digit numbers", () => {
    expect(toWhatsAppRecipient("+91 98765 43210")).toBe("919876543210");
    expect(toWhatsAppRecipient("9876543210")).toBe("919876543210");
    expect(toWhatsAppRecipient("919876543210")).toBe("919876543210");
  });
  it("rejects non-Indian-mobile numbers", () => {
    expect(() => toWhatsAppRecipient("12345")).toThrow();
    expect(() => toWhatsAppRecipient("+1 415 555 0100")).toThrow();
    expect(() => toWhatsAppRecipient("5876543210")).toThrow();
  });
});

describe("buildWhatsAppOtpPayload", () => {
  it("puts the code in both the body and the copy-code button", () => {
    const payload = buildWhatsAppOtpPayload(config, "+919876543210", "482913");
    expect(payload.to).toBe("919876543210");
    expect(payload.template.name).toBe("mb_login_code");
    expect(payload.template.components[0]).toEqual({
      type: "body",
      parameters: [{ type: "text", text: "482913" }],
    });
    expect(payload.template.components[1]).toMatchObject({ type: "button", sub_type: "url", index: "0" });
  });
  it("refuses a malformed code", () => {
    expect(() => buildWhatsAppOtpPayload(config, "9876543210", "12ab")).toThrow();
  });
});

describe("sendWhatsAppOtp", () => {
  it("POSTs to the versioned endpoint with a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    await sendWhatsAppOtp(config, "9876543210", "482913", fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v25.0/555000111/messages");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer SECRET_TOKEN_123");
  });

  it("throws with Meta's error info but never leaks the access token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Template not found", code: 132001 } }),
    });
    const err = await sendWhatsAppOtp(config, "9876543210", "482913", fetchMock as unknown as typeof fetch).catch(
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/400/);
    expect((err as Error).message).toMatch(/132001/);
    expect((err as Error).message).not.toContain("SECRET_TOKEN_123");
  });

  it("still throws a clean error when Meta returns a non-JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });
    await expect(
      sendWhatsAppOtp(config, "9876543210", "482913", fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/502/);
  });
});
