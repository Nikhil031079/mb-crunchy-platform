import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Loader2, Eye, EyeOff, ShieldCheck, ArrowRight, ArrowLeft, KeyRound, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { ROUTES } from "@/constants";

type Step = "username" | "recovery" | "newPassword" | "success";

export default function AdminForgotPasswordPage() {
  const navigate = useNavigate();
  const resetPasswordMutation = useMutation(api.adminAuth.resetPassword);

  const [step, setStep] = useState<Step>("username");
  const [username, setUsername] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adminInfo = useQuery(
    api.adminAuth.getAdminByUsername,
    username.trim() ? { username: username.trim() } : "skip",
  );

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError("Please enter your username");
      return;
    }

    if (!adminInfo) {
      setError("Admin account not found");
      return;
    }

    if (!adminInfo.hasRecoveryKey) {
      setError("No recovery key is configured for this account");
      return;
    }

    setStep("recovery");
  };

  const handleRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!recoveryKey.trim()) {
      setError("Please enter your recovery key");
      return;
    }

    const normalized = recoveryKey.trim().toUpperCase();
    if (!/^MBCR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized)) {
      setError("Invalid recovery key format. Expected: MBCR-XXXX-XXXX-XXXX-XXXX");
      return;
    }

    setRecoveryKey(normalized);
    setStep("newPassword");
  };

  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      await resetPasswordMutation({
        username: username.trim(),
        recoveryKey: recoveryKey.trim().toUpperCase(),
        newPassword: newPassword,
      });

      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed. Check your recovery key.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground text-background mb-4">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Reset Password</h1>
          <p className="text-muted-foreground mt-1">
            {step === "username" && "Enter your admin username"}
            {step === "recovery" && "Enter your recovery key"}
            {step === "newPassword" && "Create a new password"}
            {step === "success" && "Password has been reset"}
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            {/* Step: Username */}
            {step === "username" && (
              <form onSubmit={handleUsernameSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter admin username"
                    autoFocus
                    disabled={isLoading}
                    required
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={!username.trim()}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => navigate(ROUTES.ADMIN.LOGIN)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </form>
            )}

            {/* Step: Recovery Key */}
            {step === "recovery" && (
              <form onSubmit={handleRecoverySubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="recoveryKey">Recovery Key</Label>
                  <Input
                    id="recoveryKey"
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
                    placeholder="MBCR-XXXX-XXXX-XXXX-XXXX"
                    autoFocus
                    disabled={isLoading}
                    className="font-mono tracking-widest"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Format: MBCR-XXXX-XXXX-XXXX-XXXX
                  </p>
                </div>
                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={!recoveryKey.trim()}>
                  Verify Recovery Key
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("username"); setError(null); }}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              </form>
            )}

            {/* Step: New Password */}
            {step === "newPassword" && (
              <form onSubmit={handleNewPasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Create a strong password"
                      autoFocus
                      disabled={isLoading}
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    disabled={isLoading}
                    required
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                  )}
                </div>

                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
                )}

                <Button type="submit" className="w-full" disabled={isLoading || !newPassword || !confirmPassword}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Reset Password
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("recovery"); setError(null); }}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              </form>
            )}

            {/* Step: Success */}
            {step === "success" && (
              <div className="space-y-4 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold">Password Reset Successfully</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your password has been updated. You can now sign in with your new credentials.
                  </p>
                </div>
                <Button className="w-full" onClick={() => navigate(ROUTES.ADMIN.LOGIN)}>
                  Go to Login
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
