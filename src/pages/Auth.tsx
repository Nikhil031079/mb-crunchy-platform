import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import { normalizeIndianPhone, formatIndianPhoneForDisplay } from "@/utils/phone";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Phone,
  UserX,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

// ============================================================================
// Types
// ============================================================================

type AuthStep = "choice" | "phone" | "otp" | "name";

interface AuthProps {
  redirectAfterAuth?: string;
}

// ============================================================================
// Constants
// ============================================================================

const OTP_LENGTH = 6;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

// ============================================================================
// Component
// ============================================================================

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn, user } = useAuth();
  const navigate = useNavigate();
  const { siteName, logo } = useBranding();

  // Step management
  const [step, setStep] = useState<AuthStep>("choice");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phone state
  const [phoneInput, setPhoneInput] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // OTP state
  const [otpValue, setOtpValue] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Name state (for new customers)
  const [nameInput, setNameInput] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // Redirect if already authenticated
  // ============================================================================

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirectAfterAuth || "/");
    }
  }, [authLoading, isAuthenticated, navigate, redirectAfterAuth]);

  // ============================================================================
  // Resend cooldown timer
  // ============================================================================

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // ============================================================================
  // Auto-focus inputs on step change
  // ============================================================================

  useEffect(() => {
    if (step === "phone") {
      setTimeout(() => phoneInputRef.current?.focus(), 100);
    } else if (step === "otp") {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } else if (step === "name") {
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
  }, [step]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleGuestLogin = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirectAfterAuth || "/");
    } catch (err) {
      setError(
        `Failed to sign in as guest: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      setIsLoading(false);
    }
  }, [signIn, navigate, redirectAfterAuth]);

  const handlePhoneSubmit = useCallback(async () => {
    setError(null);
    const phone = normalizeIndianPhone(phoneInput);
    if (!phone) {
      setError("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    setIsLoading(true);
    setNormalizedPhone(phone);

    try {
      const result = await signIn("phone", { phone });
      if (result.signingIn) {
        // Immediate sign-in (shouldn't happen with phone OTP, but handle it)
        navigate(redirectAfterAuth || "/");
        return;
      }
      // OTP sent — move to OTP step
      setStep("otp");
      setOtpValue("");
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to send OTP. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [phoneInput, signIn, navigate, redirectAfterAuth]);

  const handleOtpSubmit = useCallback(async () => {
    if (otpValue.length !== OTP_LENGTH) {
      setError(`Please enter the complete ${OTP_LENGTH}-digit OTP.`);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn("phone", {
        phone: normalizedPhone,
        code: otpValue,
      });

      if (result.signingIn) {
        // Check if customer needs name collection
        // The customer record is created by ensureCustomerForAuthUser in CustomerLayout
        // We check after a brief delay to allow the mutation to complete
        navigate(redirectAfterAuth || "/");
      } else {
        setError("Verification failed. Please check the OTP and try again.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("rate")) {
        setError("Too many attempts. Please wait a moment and try again.");
      } else if (message.includes("expired")) {
        setError("OTP has expired. Please request a new one.");
        setStep("phone");
      } else {
        setError("Invalid OTP. Please check the code and try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [otpValue, normalizedPhone, signIn, navigate, redirectAfterAuth]);

  const handleResendOtp = useCallback(async () => {
    if (resendCooldown > 0) return;

    setError(null);
    setIsLoading(true);

    try {
      await signIn("phone", { phone: normalizedPhone });
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setOtpValue("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to resend OTP. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [normalizedPhone, signIn, resendCooldown]);

  const handleBackToPhone = useCallback(() => {
    setStep("phone");
    setOtpValue("");
    setError(null);
    setPhoneInput("");
    setNormalizedPhone("");
  }, []);

  const handleBackToChoice = useCallback(() => {
    setStep("choice");
    setPhoneInput("");
    setNormalizedPhone("");
    setOtpValue("");
    setError(null);
  }, []);

  // ============================================================================
  // Render: Choice Step (Guest vs Phone)
  // ============================================================================

  const renderChoiceStep = () => (
    <CardContent className="space-y-3 p-5 sm:p-6">
      <Button
        variant="crunch"
        className="h-11 w-full font-culinary-heading"
        onClick={() => setStep("phone")}
        disabled={isLoading}
      >
        <Phone className="mr-2 h-4 w-4" />
        Login / Sign up with Phone
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/60" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="glass-tier-1 rounded-full px-3 py-0.5 text-muted-foreground">or</span>
        </div>
      </div>

      <Button
        variant="ghost"
        className="h-11 w-full"
        onClick={handleGuestLogin}
        disabled={isLoading}
      >
        <UserX className="mr-2 h-4 w-4" />
        Continue as Guest
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </CardContent>
  );

  // ============================================================================
  // Render: Phone Step
  // ============================================================================

  const renderPhoneStep = () => (
    <CardContent className="space-y-4 p-5 sm:p-6">
      <div className="space-y-2">
        <Label htmlFor="phone">Mobile Number</Label>
        <div className="flex">
          <span className="inline-flex h-11 items-center rounded-l-xl border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
            +91
          </span>
          <Input
            ref={phoneInputRef}
            id="phone"
            type="tel"
            placeholder="98765 43210"
            glass
            className="h-11 rounded-l-none rounded-r-xl"
            value={phoneInput}
            onChange={(e) => {
              setPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 10));
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && phoneInput.length === 10) {
                handlePhoneSubmit();
              }
            }}
            disabled={isLoading}
            autoComplete="tel"
            inputMode="numeric"
            aria-label="10-digit Indian mobile number"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          We&apos;ll send a verification code to this number
        </p>
      </div>

      {error && (
        <p
          className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <Button
        variant="crunch"
        className="h-11 w-full font-culinary-heading"
        onClick={handlePhoneSubmit}
        disabled={isLoading || phoneInput.length !== 10}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Phone className="mr-2 h-4 w-4" />
        )}
        {isLoading ? "Sending OTP..." : "Send OTP"}
      </Button>

      <Button
        variant="ghost"
        className="h-11 w-full"
        onClick={handleBackToChoice}
        disabled={isLoading}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>
    </CardContent>
  );

  // ============================================================================
  // Render: OTP Step
  // ============================================================================

  const renderOtpStep = () => (
    <CardContent className="space-y-4 p-5 sm:p-6">
      <div className="space-y-1 text-center">
        <p className="text-sm text-muted-foreground">
          Enter the {OTP_LENGTH}-digit code sent to
        </p>
        <p className="font-culinary-heading text-sm font-bold tabular-nums">
          {formatIndianPhoneForDisplay(normalizedPhone)}
        </p>
      </div>

      <div className="flex justify-center rounded-2xl border border-border/50 bg-white/50 px-2 py-4 dark:bg-white/5">
        <InputOTP
          maxLength={OTP_LENGTH}
          value={otpValue}
          onChange={(value) => {
            setOtpValue(value);
            setError(null);
          }}
          onComplete={(value) => {
            setOtpValue(value);
            // Auto-submit when OTP is complete
            setTimeout(() => handleOtpSubmit(), 100);
          }}
          ref={otpInputRef}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      {error && (
        <p
          className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <Button
        variant="crunch"
        className="h-11 w-full font-culinary-heading"
        onClick={handleOtpSubmit}
        disabled={isLoading || otpValue.length !== OTP_LENGTH}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="mr-2 h-4 w-4" />
        )}
        {isLoading ? "Verifying..." : "Verify OTP"}
      </Button>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackToPhone}
          disabled={isLoading}
        >
          <ArrowLeft className="mr-1 h-3 w-3" />
          Change number
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleResendOtp}
          disabled={isLoading || resendCooldown > 0}
          className="tabular-nums"
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          {resendCooldown > 0
            ? `Resend in ${resendCooldown}s`
            : "Resend OTP"}
        </Button>
      </div>
    </CardContent>
  );

  // ============================================================================
  // Render
  // ============================================================================

  const stepTitles: Record<AuthStep, { title: string; description: string }> = {
    choice: {
      title: "Get Started",
      description: "Login to your account or continue as a guest",
    },
    phone: {
      title: "Enter Phone Number",
      description: "We'll send you a verification code",
    },
    otp: {
      title: "Verify OTP",
      description: `Enter the code sent to ${formatIndianPhoneForDisplay(normalizedPhone)}`,
    },
    name: {
      title: "Your Name",
      description: "Tell us your name to personalize your experience",
    },
  };

  const { title, description } = stepTitles[step];

  return (
    <div className="min-h-screen culinary-canvas flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center">
            <span className="glass-tier-2 mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
              <img
                src={logo || "/logo.svg"}
                alt={siteName}
                width={40}
                height={40}
                className="rounded-lg"
              />
            </span>
          </div>
          <h1 className="font-culinary-heading text-2xl font-bold tracking-tight sm:text-3xl">{siteName}</h1>
          <p className="text-muted-foreground mt-1 text-sm">Welcome to the storefront</p>
        </div>

        <Card className="rounded-3xl glass-tier-1">
          <CardHeader className="text-center pb-2">
            <CardTitle className="font-culinary-heading text-xl font-bold tracking-tight">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {step === "choice" && renderChoiceStep()}
              {step === "phone" && renderPhoneStep()}
              {step === "otp" && renderOtpStep()}
            </motion.div>
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return <Auth {...props} />;
}
