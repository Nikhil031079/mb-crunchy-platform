import { useState } from "react";
import { useNavigate } from "react-router";
import { Loader2, Eye, EyeOff, ShieldCheck, Copy, Check, ArrowRight, Download, Printer, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { hashPassword } from "@/utils/crypto";
import { ROUTES } from "@/constants";

type Step = "credentials" | "recovery";

export default function AdminSetupPage() {
  const navigate = useNavigate();
  const setupMutation = useMutation(api.adminAuth.setup);

  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [keyCopied, setKeyCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordStrength = getPasswordStrength(password);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (passwordStrength.score < 2) {
      setError("Password is too weak");
      return;
    }

    setIsLoading(true);
    try {
      const { hash: pwHash, salt: pwSalt } = await hashPassword(password);
      const key = generateRecoveryKey();
      const { hash: rkHash, salt: rkSalt } = await hashPassword(key);

      await setupMutation({
        username: username.trim(),
        passwordHash: pwHash,
        passwordSalt: pwSalt,
        role: "superadmin",
        recoveryKeyHash: rkHash,
        recoveryKeySalt: rkSalt,
      });

      setRecoveryKey(key);
      setStep("recovery");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = recoveryKey;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const handleDownloadKey = () => {
    const content = [
      "MB Crunchy - Admin Recovery Key",
      "================================",
      "",
      `Username: ${username}`,
      `Recovery Key: ${recoveryKey}`,
      "",
      "IMPORTANT: Store this key in a safe place.",
      "You will need it to reset your password if you forget it.",
      "This key will not be shown again.",
      "",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mb-crunchy-recovery-key-${username}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintKey = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Recovery Key</title></head>
      <body style="font-family:monospace;padding:40px;">
        <h2>MB Crunchy - Admin Recovery Key</h2>
        <p><strong>Username:</strong> ${username}</p>
        <p><strong>Recovery Key:</strong> ${recoveryKey}</p>
        <p style="color:red;margin-top:20px;"><strong>Store this key in a safe place. It will not be shown again.</strong></p>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleComplete = () => {
    navigate(ROUTES.ADMIN.LOGIN);
  };

  // Recovery key step
  if (step === "recovery") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground text-background mb-4">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Save Your Recovery Key</h1>
          </div>

          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <CardTitle className="text-lg">Recovery Key Generated</CardTitle>
              <CardDescription>
                This is your only chance to save this key. Store it somewhere safe.
                You will need it to reset your password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative rounded-lg border-2 border-dashed border-amber-300 bg-amber-500/5 p-4">
                <p className="text-center font-mono text-lg font-bold tracking-widest text-foreground select-all">
                  {recoveryKey}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyKey}>
                  {keyCopied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {keyCopied ? "Copied" : "Copy"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadKey}>
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrintKey}>
                  <Printer className="h-4 w-4 mr-1" />
                  Print
                </Button>
              </div>

              <Button className="w-full" onClick={handleComplete}>
                Continue to Login
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Credentials step
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground text-background mb-4">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">MB Crunchy Setup</h1>
          <p className="text-muted-foreground mt-1">Create your first admin account</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>Create Admin Account</CardTitle>
            <CardDescription>Set up the superadmin credentials for the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  autoComplete="username"
                  autoFocus
                  disabled={isLoading}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                    disabled={isLoading}
                    required
                    className="pr-10"
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
                {password && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            i < passwordStrength.score
                              ? passwordStrength.score <= 1
                                ? "bg-red-500"
                                : passwordStrength.score === 2
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{passwordStrength.label}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  disabled={isLoading}
                  required
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !username.trim() || !password || !confirmPassword}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Create Admin Account
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function generateRecoveryKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segments: string[] = ["MBCR"];
  for (let s = 0; s < 4; s++) {
    let segment = "";
    for (let i = 0; i < 4; i++) {
      segment += chars[Math.floor(Math.random() * chars.length)];
    }
    segments.push(segment);
  }
  return segments.join("-");
}

function getPasswordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score: 1, label: "Weak" };
  if (score <= 2) return { score: 2, label: "Fair" };
  if (score <= 3) return { score: 3, label: "Good" };
  return { score: 4, label: "Strong" };
}
