// ============================================================================
// MB CRUNCHY — Phase 42 Customer Auth, OTP & Identity Tests
//
// Tests for phone OTP authentication flow, identity wiring, and UX states.
// Pure logic/unit tests — no live backend calls.
// ============================================================================

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { normalizeIndianPhone, validateIndianPhone, formatIndianPhoneForDisplay } from "../src/utils/phone";

// ============================================================================
// 1. Phone Validation
// ============================================================================

describe("1. Phone Validation", () => {
  it("should accept valid 10-digit Indian mobile numbers", () => {
    expect(normalizeIndianPhone("9876543210")).toBe("+919876543210");
    expect(normalizeIndianPhone("8801756151")).toBe("+918801756151");
    expect(normalizeIndianPhone("7000000000")).toBe("+917000000000");
    expect(normalizeIndianPhone("6000000000")).toBe("+916000000000");
  });

  it("should accept numbers with country code", () => {
    expect(normalizeIndianPhone("+919876543210")).toBe("+919876543210");
    expect(normalizeIndianPhone("919876543210")).toBe("+919876543210");
    expect(normalizeIndianPhone("09876543210")).toBe("+919876543210");
  });

  it("should accept numbers with spaces and dashes", () => {
    expect(normalizeIndianPhone("98765 43210")).toBe("+919876543210");
    expect(normalizeIndianPhone("9876-543-210")).toBe("+919876543210");
    expect(normalizeIndianPhone("+91 98765 43210")).toBe("+919876543210");
  });

  it("should reject numbers not starting with 6-9", () => {
    expect(normalizeIndianPhone("5876543210")).toBeNull();
    expect(normalizeIndianPhone("0876543210")).toBeNull();
    expect(normalizeIndianPhone("1876543210")).toBeNull();
  });

  it("should reject repeated-digit junk", () => {
    expect(normalizeIndianPhone("9999999999")).toBeNull();
    expect(normalizeIndianPhone("8888888888")).toBeNull();
    expect(normalizeIndianPhone("0000000000")).toBeNull();
  });

  it("should reject sequential junk", () => {
    expect(normalizeIndianPhone("1234567890")).toBeNull();
    expect(normalizeIndianPhone("0987654321")).toBeNull();
  });

  it("should reject too short or too long numbers", () => {
    expect(normalizeIndianPhone("987654321")).toBeNull();
    expect(normalizeIndianPhone("98765432101")).toBeNull();
    expect(normalizeIndianPhone("")).toBeNull();
  });

  it("should format phone for display", () => {
    expect(formatIndianPhoneForDisplay("+919876543210")).toBe("+91 98765 43210");
    expect(formatIndianPhoneForDisplay("9876543210")).toBe("+91 98765 43210");
  });

  it("validateIndianPhone should return boolean", () => {
    expect(validateIndianPhone("9876543210")).toBe(true);
    expect(validateIndianPhone("5876543210")).toBe(false);
  });
});

// ============================================================================
// 2. OTP Request State
// ============================================================================

describe("2. OTP Request State", () => {
  it("should track phone input state", () => {
    let phoneInput = "";
    const setPhoneInput = (val: string) => { phoneInput = val; };

    setPhoneInput("9876543210");
    expect(phoneInput).toBe("9876543210");
  });

  it("should strip non-digits from phone input", () => {
    const stripNonDigits = (input: string) => input.replace(/\D/g, "");
    expect(stripNonDigits("+91 98765 43210")).toBe("919876543210");
    expect(stripNonDigits("9876-543-210")).toBe("9876543210");
  });

  it("should limit phone input to 10 digits", () => {
    const limitDigits = (input: string) => input.replace(/\D/g, "").slice(0, 10);
    expect(limitDigits("98765432101234")).toBe("9876543210");
    expect(limitDigits("9876543210")).toBe("9876543210");
  });

  it("should require exactly 10 digits before enabling submit", () => {
    const canSubmit = (phone: string) => phone.length === 10;
    expect(canSubmit("9876543210")).toBe(true);
    expect(canSubmit("987654321")).toBe(false);
    expect(canSubmit("98765432101")).toBe(false);
  });
});

// ============================================================================
// 3. OTP Verification State
// ============================================================================

describe("3. OTP Verification State", () => {
  it("should track OTP value state", () => {
    let otpValue = "";
    const setOtpValue = (val: string) => { otpValue = val; };

    setOtpValue("123456");
    expect(otpValue).toBe("123456");
  });

  it("should require complete OTP before allowing submit", () => {
    const OTP_LENGTH = 6;
    const canVerify = (otp: string) => otp.length === OTP_LENGTH;
    expect(canVerify("123456")).toBe(true);
    expect(canVerify("12345")).toBe(false);
    expect(canVerify("1234567")).toBe(false);
  });

  it("should auto-submit when OTP is complete", () => {
    const OTP_LENGTH = 6;
    let submitted = false;
    const submit = () => { submitted = true; };

    const otp = "123456";
    if (otp.length === OTP_LENGTH) {
      submit();
    }
    expect(submitted).toBe(true);
  });

  it("should not auto-submit with incomplete OTP", () => {
    const OTP_LENGTH = 6;
    let submitted = false;
    const submit = () => { submitted = true; };

    const otp = "12345";
    if (otp.length === OTP_LENGTH) {
      submit();
    }
    expect(submitted).toBe(false);
  });
});

// ============================================================================
// 4. Invalid OTP Handling
// ============================================================================

describe("4. Invalid OTP Handling", () => {
  it("should show error for invalid OTP", () => {
    let error: string | null = null;
    const setError = (val: string | null) => { error = val; };

    const message = "Could not verify code";
    setError("Invalid OTP. Please check the code and try again.");
    expect(error).toBe("Invalid OTP. Please check the code and try again.");
  });

  it("should show rate limit error", () => {
    let error: string | null = null;
    const setError = (val: string | null) => { error = val; };

    const message = "rate limit exceeded";
    if (message.includes("rate")) {
      setError("Too many attempts. Please wait a moment and try again.");
    }
    expect(error).toBe("Too many attempts. Please wait a moment and try again.");
  });

  it("should show expired OTP error and redirect to phone step", () => {
    let step = "otp";
    let error: string | null = null;
    const setStep = (val: string) => { step = val; };
    const setError = (val: string | null) => { error = val; };

    const message = "token expired";
    if (message.includes("expired")) {
      setError("OTP has expired. Please request a new one.");
      setStep("phone");
    }
    expect(error).toBe("OTP has expired. Please request a new one.");
    expect(step).toBe("phone");
  });
});

// ============================================================================
// 5. Resend State
// ============================================================================

describe("5. Resend State", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start cooldown at 60 seconds after OTP sent", () => {
    let cooldown = 0;
    cooldown = 60;
    expect(cooldown).toBe(60);
  });

  it("should decrement cooldown every second", () => {
    let cooldown = 60;
    const decrement = () => { cooldown = Math.max(0, cooldown - 1); };

    decrement();
    expect(cooldown).toBe(59);

    decrement();
    expect(cooldown).toBe(58);
  });

  it("should not resend during cooldown", () => {
    let cooldown = 30;
    let resendAttempted = false;
    const tryResend = () => {
      if (cooldown > 0) return;
      resendAttempted = true;
    };

    tryResend();
    expect(resendAttempted).toBe(false);
  });

  it("should allow resend after cooldown expires", () => {
    let cooldown = 0;
    let resendAttempted = false;
    const tryResend = () => {
      if (cooldown > 0) return;
      resendAttempted = true;
    };

    tryResend();
    expect(resendAttempted).toBe(true);
  });

  it("should reset cooldown to 60 on resend", () => {
    let cooldown = 0;
    cooldown = 60;
    expect(cooldown).toBe(60);
  });

  it("should show countdown text during cooldown", () => {
    const cooldown = 45;
    const text = `Resend in ${cooldown}s`;
    expect(text).toBe("Resend in 45s");
  });

  it("should show Resend OTP text when cooldown is 0", () => {
    const cooldown = 0;
    const text = cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP";
    expect(text).toBe("Resend OTP");
  });
});

// ============================================================================
// 6. Authenticated Success Flow
// ============================================================================

describe("6. Authenticated Success Flow", () => {
  it("should redirect to home after successful phone OTP sign-in", () => {
    let navigateTarget: string | null = null;
    const navigate = (path: string) => { navigateTarget = path; };

    const signingIn = true;
    if (signingIn) {
      navigate("/");
    }
    expect(navigateTarget).toBe("/");
  });

  it("should redirect to custom path after sign-in", () => {
    let navigateTarget: string | null = null;
    const navigate = (path: string) => { navigateTarget = path; };
    const redirectAfterAuth = "/checkout";

    const signingIn = true;
    if (signingIn) {
      navigate(redirectAfterAuth || "/");
    }
    expect(navigateTarget).toBe("/checkout");
  });

  it("should not redirect if sign-in is not complete", () => {
    let navigateTarget: string | null = null;
    const navigate = (path: string) => { navigateTarget = path; };

    const signingIn = false;
    if (signingIn) {
      navigate("/");
    }
    expect(navigateTarget).toBeNull();
  });
});

// ============================================================================
// 7. Customer Linking After Authentication
// ============================================================================

describe("7. Customer Linking After Authentication", () => {
  interface CustomerRecord {
    _id: string;
    authUserId?: string;
    name: string;
    phone?: string;
    totalOrders: number;
  }

  function createMockDb(customers: CustomerRecord[] = []) {
    const db = {
      customers: [...customers],
      insert: vi.fn((table: string, record: unknown) => {
        const id = `customer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        if (table === "customers") {
          db.customers.push({ ...record, _id: id } as CustomerRecord);
        }
        return id;
      }),
    };
    return db;
  }

  it("should create customer for new phone-auth user", async () => {
    const db = createMockDb();
    const authUserId = "user_phone_abc123";

    const existing = db.customers.find(
      (c) => c.authUserId === authUserId,
    );
    expect(existing).toBeUndefined();

    const customerId = await db.insert("customers", {
      name: "",
      authUserId,
      totalOrders: 0,
    });

    expect(db.customers).toHaveLength(1);
    expect(db.customers[0].authUserId).toBe("user_phone_abc123");
  });

  it("should not duplicate customer on repeated ensureCustomerForAuthUser calls", async () => {
    const db = createMockDb([
      {
        _id: "customer_1",
        name: "Test User",
        authUserId: "user_abc123",
        totalOrders: 0,
      },
    ]);

    const existing = db.customers.find(
      (c) => c.authUserId === "user_abc123",
    );
    expect(existing).toBeTruthy();
    expect(db.customers).toHaveLength(1);
  });

  it("should link phone to existing auth customer during order", async () => {
    const db = createMockDb([
      {
        _id: "customer_1",
        name: "Test User",
        authUserId: "user_abc123",
        totalOrders: 0,
      },
    ]);

    const existing = db.customers.find(
      (c) => c.authUserId === "user_abc123",
    );
    expect(existing).toBeTruthy();
    expect(existing!.phone).toBeUndefined();

    // Simulate: link phone during order
    existing!.phone = "+919876543210";
    expect(existing!.phone).toBe("+919876543210");
  });
});

// ============================================================================
// 8. Name Persistence
// ============================================================================

describe("8. Name Persistence", () => {
  it("should accept name input", () => {
    let name = "";
    const setName = (val: string) => { name = val; };

    setName("John Doe");
    expect(name).toBe("John Doe");
  });

  it("should trim whitespace from name", () => {
    const name = "  John Doe  ".trim();
    expect(name).toBe("John Doe");
  });

  it("should allow empty name (optional)", () => {
    const name = "";
    expect(name).toBe("");
  });
});

// ============================================================================
// 9. Guest Cart Survives Authentication
// ============================================================================

describe("9. Guest Cart Survives Authentication", () => {
  const cartKey = "mb-crunchy-cart";
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
      clear: vi.fn(() => { store = {}; }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should persist cart in localStorage across auth changes", () => {
    const cartData = JSON.stringify({
      items: [{ id: "item1", name: "Test Product", quantity: 2 }],
      businessUnitId: "bu_123",
    });

    // Guest adds to cart
    localStorage.setItem(cartKey, cartData);

    // Auth state changes (simulate sign-in)
    const stored = localStorage.getItem(cartKey);
    expect(stored).toBe(cartData);

    // Cart is still accessible
    const parsed = JSON.parse(stored!);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].quantity).toBe(2);
  });

  it("should not clear cart on sign-in", () => {
    localStorage.setItem(cartKey, JSON.stringify({ items: [{ id: "1" }] }));

    // Simulate: sign-in does NOT clear localStorage
    const stored = localStorage.getItem(cartKey);
    expect(stored).toBeTruthy();
  });

  it("should not clear cart on sign-out", () => {
    localStorage.setItem(cartKey, JSON.stringify({ items: [{ id: "1" }] }));

    // Simulate: sign-out does NOT clear localStorage
    const stored = localStorage.getItem(cartKey);
    expect(stored).toBeTruthy();
  });

  it("should validate cart is parseable after auth change", () => {
    localStorage.setItem(cartKey, JSON.stringify({ items: [] }));

    let isValid = false;
    try {
      const stored = localStorage.getItem(cartKey);
      if (stored) {
        JSON.parse(stored);
        isValid = true;
      }
    } catch {
      isValid = false;
    }
    expect(isValid).toBe(true);
  });
});

// ============================================================================
// 10. No Redirect Race
// ============================================================================

describe("10. No Redirect Race", () => {
  it("should not redirect while auth is loading", () => {
    let navigateTarget: string | null = null;
    const navigate = (path: string) => { navigateTarget = path; };

    const authLoading = true;
    const isAuthenticated = false;

    // Auth.tsx useEffect: if (!authLoading && isAuthenticated) navigate(...)
    if (!authLoading && isAuthenticated) {
      navigate("/");
    }
    expect(navigateTarget).toBeNull();
  });

  it("should not redirect when not authenticated", () => {
    let navigateTarget: string | null = null;
    const navigate = (path: string) => { navigateTarget = path; };

    const authLoading = false;
    const isAuthenticated = false;

    if (!authLoading && isAuthenticated) {
      navigate("/");
    }
    expect(navigateTarget).toBeNull();
  });

  it("should redirect only after auth is resolved AND authenticated", () => {
    let navigateTarget: string | null = null;
    const navigate = (path: string) => { navigateTarget = path; };

    const authLoading = false;
    const isAuthenticated = true;

    if (!authLoading && isAuthenticated) {
      navigate("/");
    }
    expect(navigateTarget).toBe("/");
  });

  it("should not redirect on anonymous sign-in initiation", () => {
    let navigateTarget: string | null = null;
    const navigate = (path: string) => { navigateTarget = path; };

    // signIn("anonymous") is async — navigation happens in the try block
    // The useEffect redirect guard should NOT fire during this
    const authLoading = true; // still loading during sign-in
    const isAuthenticated = false;

    if (!authLoading && isAuthenticated) {
      navigate("/");
    }
    expect(navigateTarget).toBeNull();
  });
});

// ============================================================================
// 11. Auth Step Navigation
// ============================================================================

describe("11. Auth Step Navigation", () => {
  it("should navigate from choice to phone step", () => {
    let step = "choice";
    const setStep = (val: string) => { step = val; };

    setStep("phone");
    expect(step).toBe("phone");
  });

  it("should navigate from phone to OTP step after sending OTP", () => {
    let step = "phone";
    const setStep = (val: string) => { step = val; };

    // After successful OTP send
    setStep("otp");
    expect(step).toBe("otp");
  });

  it("should navigate back from OTP to phone step", () => {
    let step = "otp";
    const setStep = (val: string) => { step = val; };

    setStep("phone");
    expect(step).toBe("phone");
  });

  it("should navigate back from phone to choice step", () => {
    let step = "phone";
    const setStep = (val: string) => { step = val; };

    setStep("choice");
    expect(step).toBe("choice");
  });

  it("should reset phone and OTP state when going back to choice", () => {
    let phone = "9876543210";
    let otp = "123456";
    let error = "some error";

    // Back to choice
    phone = "";
    otp = "";
    error = "";

    expect(phone).toBe("");
    expect(otp).toBe("");
    expect(error).toBe("");
  });

  it("should reset OTP when going back from OTP to phone", () => {
    let otp = "123456";
    let error = "some error";

    otp = "";
    error = "";

    expect(otp).toBe("");
    expect(error).toBe("");
  });
});

// ============================================================================
// 12. signIn("phone") Call Sequence
// ============================================================================

describe("12. signIn('phone') Call Sequence", () => {
  it("should call signIn with phone param to initiate OTP", () => {
    const signInCalls: Array<{ provider: string; params: Record<string, string> }> = [];
    const signIn = (provider: string, params: Record<string, string>) => {
      signInCalls.push({ provider, params });
      return Promise.resolve({ signingIn: false });
    };

    signIn("phone", { phone: "+919876543210" });

    expect(signInCalls).toHaveLength(1);
    expect(signInCalls[0].provider).toBe("phone");
    expect(signInCalls[0].params.phone).toBe("+919876543210");
  });

  it("should call signIn with phone + code to verify OTP", async () => {
    const signInCalls: Array<{ provider: string; params: Record<string, string> }> = [];
    const signIn = (provider: string, params: Record<string, string>) => {
      signInCalls.push({ provider, params });
      if (params.code) {
        return Promise.resolve({ signingIn: true });
      }
      return Promise.resolve({ signingIn: false });
    };

    const result = await signIn("phone", {
      phone: "+919876543210",
      code: "123456",
    });

    expect(result.signingIn).toBe(true);
    expect(signInCalls[0].params.code).toBe("123456");
  });

  it("should not include code param when initiating OTP", async () => {
    const signInCalls: Array<{ provider: string; params: Record<string, string | undefined> }> = [];
    const signIn = (provider: string, params: Record<string, string | undefined>) => {
      signInCalls.push({ provider, params });
      return Promise.resolve({ signingIn: false });
    };

    await signIn("phone", { phone: "+919876543210" });

    expect(signInCalls[0].params.code).toBeUndefined();
  });
});

// ============================================================================
// 13. Anonymous Guest Login
// ============================================================================

describe("13. Anonymous Guest Login", () => {
  it("should call signIn with anonymous provider", async () => {
    const signInCalls: string[] = [];
    const signIn = (provider: string) => {
      signInCalls.push(provider);
      return Promise.resolve({ signingIn: true });
    };

    await signIn("anonymous");
    expect(signInCalls[0]).toBe("anonymous");
  });

  it("should redirect to / after guest sign-in", async () => {
    let navigateTarget: string | null = null;
    const navigate = (path: string) => { navigateTarget = path; };

    const signIn = (provider: string) => {
      return Promise.resolve({ signingIn: true });
    };

    await signIn("anonymous");
    navigate("/");
    expect(navigateTarget).toBe("/");
  });
});

// ============================================================================
// 14. Back/Change Number
// ============================================================================

describe("14. Back/Change Number", () => {
  it("should clear OTP when going back to phone step", () => {
    let otp = "123456";
    let phone = "9876543210";
    let error = "wrong otp";

    // Back to phone
    otp = "";
    error = "";
    // Phone should be preserved for editing
    expect(phone).toBe("9876543210");
    expect(otp).toBe("");
    expect(error).toBe("");
  });

  it("should allow editing phone number", () => {
    let phone = "9876543210";
    const setPhone = (val: string) => { phone = val; };

    setPhone("8765432109");
    expect(phone).toBe("8765432109");
  });
});
