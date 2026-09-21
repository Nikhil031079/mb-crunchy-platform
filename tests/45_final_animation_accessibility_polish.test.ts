// ============================================================================
// MB CRUNCHY — Phase 45 Final Animation & Accessibility Polish Tests
//
// Tests for auth step transitions, combo/party pack press feedback,
// and reduced-motion accessibility.
// Pure logic/unit tests — no live backend calls.
// ============================================================================

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ============================================================================
// Helpers — read source files for structural verification
// ============================================================================

function readSource(relativePath: string): string {
  const fullPath = path.resolve(__dirname, "..", relativePath);
  return fs.readFileSync(fullPath, "utf-8");
}

// ============================================================================
// 1. Auth Step Transitions
// ============================================================================

describe("1. Auth Step Transitions", () => {
  const authSource = readSource("src/pages/Auth.tsx");

  it("should import framer-motion AnimatePresence and motion", () => {
    expect(authSource).toContain('from "framer-motion"');
    expect(authSource).toContain("AnimatePresence");
    expect(authSource).toContain("motion");
  });

  it("should wrap step content in AnimatePresence with mode=wait", () => {
    expect(authSource).toContain('AnimatePresence mode="wait"');
  });

  it("should use key={step} on motion.div for step switching", () => {
    expect(authSource).toContain("key={step}");
  });

  it("should have initial/animate/exit props on motion.div", () => {
    expect(authSource).toContain("initial=");
    expect(authSource).toContain("animate=");
    expect(authSource).toContain("exit=");
  });

  it("should have a short transition duration", () => {
    // Transition should be fast (0.15s or less) to not delay auth flow
    expect(authSource).toContain("duration: 0.15");
  });

  it("should still render all three steps conditionally inside motion.div", () => {
    expect(authSource).toContain('step === "choice"');
    expect(authSource).toContain('step === "phone"');
    expect(authSource).toContain('step === "otp"');
  });

  it("should not interfere with OTP auto-submit", () => {
    // OTP onComplete should still call handleOtpSubmit via setTimeout
    expect(authSource).toContain("onComplete");
    expect(authSource).toContain("handleOtpSubmit");
  });

  it("should not interfere with resend timer", () => {
    expect(authSource).toContain("resendCooldown");
    expect(authSource).toContain("handleResendOtp");
  });

  it("should not interfere with focus management", () => {
    expect(authSource).toContain("phoneInputRef");
    expect(authSource).toContain("otpInputRef");
    expect(authSource).toContain(".focus()");
  });
});

// ============================================================================
// 2. Combo Card Press Feedback
// ============================================================================

describe("2. Combo Card Press Feedback", () => {
  const comboSource = readSource("src/components/customer/ComboCard.tsx");

  it("should have active:scale-95 on Add button", () => {
    expect(comboSource).toContain("active:scale-95");
  });

  it("should have transition-transform alongside active:scale-95", () => {
    expect(comboSource).toContain("transition-transform");
  });

  it("should preserve disabled behavior when unavailable", () => {
    expect(comboSource).toContain("disabled={isUnavailable}");
  });

  it("should preserve button variant and size", () => {
    expect(comboSource).toContain('variant="default"');
    expect(comboSource).toContain('size="sm"');
  });

  it("should show Unavailable text when isUnavailable is true", () => {
    expect(comboSource).toContain('"Unavailable"');
    expect(comboSource).toContain('"Add"');
  });

  it("active:scale-95 should be on the Add button specifically, not the card", () => {
    // Find the line with active:scale-95 and verify it's near the Button, not the Card
    const lines = comboSource.split("\n");
    const scaleLine = lines.findIndex((l) => l.includes("active:scale-95"));
    expect(scaleLine).toBeGreaterThan(-1);

    // The line before or nearby should reference the Button's className
    const nearbyLines = lines.slice(Math.max(0, scaleLine - 5), scaleLine + 3).join("\n");
    expect(nearbyLines).toContain("gap-1.5 rounded-lg text-xs");
  });
});

// ============================================================================
// 3. Party Pack Card Press Feedback
// ============================================================================

describe("3. Party Pack Card Press Feedback", () => {
  const packSource = readSource("src/components/customer/PartyPackCard.tsx");

  it("should have active:scale-95 on Add button", () => {
    expect(packSource).toContain("active:scale-95");
  });

  it("should have transition-transform alongside active:scale-95", () => {
    expect(packSource).toContain("transition-transform");
  });

  it("should preserve disabled behavior when unavailable", () => {
    expect(packSource).toContain("disabled={isUnavailable}");
  });

  it("should preserve button variant and size", () => {
    expect(packSource).toContain('variant="default"');
    expect(packSource).toContain('size="sm"');
  });

  it("should show Unavailable text when isUnavailable is true", () => {
    expect(packSource).toContain('"Unavailable"');
    expect(packSource).toContain('"Add"');
  });

  it("active:scale-95 should be on the Add button specifically, not the card", () => {
    const lines = packSource.split("\n");
    const scaleLine = lines.findIndex((l) => l.includes("active:scale-95"));
    expect(scaleLine).toBeGreaterThan(-1);

    const nearbyLines = lines.slice(Math.max(0, scaleLine - 5), scaleLine + 3).join("\n");
    expect(nearbyLines).toContain("gap-1.5 rounded-lg text-xs");
  });
});

// ============================================================================
// 4. Reduced Motion CSS
// ============================================================================

describe("4. Reduced Motion CSS", () => {
  const cssSource = readSource("src/index.css");

  it("should contain prefers-reduced-motion media query", () => {
    expect(cssSource).toContain("prefers-reduced-motion: reduce");
  });

  it("should disable animation-duration for reduced motion users", () => {
    expect(cssSource).toContain("animation-duration: 0.01ms");
  });

  it("should set animation-iteration-count to 1", () => {
    expect(cssSource).toContain("animation-iteration-count: 1");
  });

  it("should disable transition-duration for reduced motion users", () => {
    expect(cssSource).toContain("transition-duration: 0.01ms");
  });

  it("should set scroll-behavior to auto", () => {
    expect(cssSource).toContain("scroll-behavior: auto");
  });

  it("should preserve spinner functionality via .animate-spin override", () => {
    expect(cssSource).toContain(".animate-spin");
    expect(cssSource).toContain("animation-duration: 1s");
  });

  it("should use !important to override Tailwind utility classes", () => {
    // The reduced-motion rules need !important to override inline Tailwind classes
    const reducedMotionSection = cssSource.substring(
      cssSource.indexOf("prefers-reduced-motion: reduce")
    );
    expect(reducedMotionSection).toContain("!important");
  });

  it("should apply to all elements via universal selector", () => {
    const reducedMotionSection = cssSource.substring(
      cssSource.indexOf("prefers-reduced-motion: reduce")
    );
    expect(reducedMotionSection).toContain("*,");
    expect(reducedMotionSection).toContain("*::before,");
    expect(reducedMotionSection).toContain("*::after");
  });
});

// ============================================================================
// 5. Cross-cutting: No Regressions
// ============================================================================

describe("5. Cross-cutting: No Regressions", () => {
  it("Auth.tsx should still have all original imports", () => {
    const authSource = readSource("src/pages/Auth.tsx");
    expect(authSource).toContain('from "@/components/ui/button"');
    expect(authSource).toContain('from "@/components/ui/card"');
    expect(authSource).toContain('from "@/components/ui/input"');
    expect(authSource).toContain('from "@/components/ui/input-otp"');
    expect(authSource).toContain('from "@/hooks/use-auth"');
    expect(authSource).toContain('from "react-router"');
  });

  it("ComboCard should still export ComboCard and ComboCardSkeleton", () => {
    const comboSource = readSource("src/components/customer/ComboCard.tsx");
    expect(comboSource).toContain("export const ComboCard");
    expect(comboSource).toContain("export function ComboCardSkeleton");
  });

  it("PartyPackCard should still export PartyPackCard and PartyPackCardSkeleton", () => {
    const packSource = readSource("src/components/customer/PartyPackCard.tsx");
    expect(packSource).toContain("export const PartyPackCard");
    expect(packSource).toContain("export function PartyPackCardSkeleton");
  });

  it("index.css should preserve existing Tailwind imports", () => {
    const cssSource = readSource("src/index.css");
    expect(cssSource).toContain('@import "tailwindcss"');
    expect(cssSource).toContain('@import "tw-animate-css"');
  });

  it("index.css should preserve existing theme variables", () => {
    const cssSource = readSource("src/index.css");
    expect(cssSource).toContain("--color-background");
    expect(cssSource).toContain("--color-primary");
    expect(cssSource).toContain("--color-accent");
  });
});
