import { useState, useCallback } from "react";
import QRCode from "react-qr-code";
import { Copy, Check, MessageCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils";

// ============================================================================
// PaymentQR — UPI QR Code payment modal
// ============================================================================

interface PaymentQRProps {
  upiId: string;
  merchantName: string;
  amount: number;
  orderNumber: string;
  whatsappNumber?: string;
  onPaid: () => void;
  onWhatsApp?: () => void;
  onClose: () => void;
}

function buildUpiUri(upiId: string, merchantName: string, amount: number, orderNumber: string): string {
  const params = new URLSearchParams({
    pa: upiId,
    pn: merchantName,
    am: amount.toFixed(2),
    INR: "",
    tn: `Order #${orderNumber}`,
    cu: "INR",
  });
  return `upi://pay?${params.toString()}`;
}

export function PaymentQR({
  upiId,
  merchantName,
  amount,
  orderNumber,
  whatsappNumber,
  onPaid,
  onWhatsApp,
  onClose,
}: PaymentQRProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      toast.success("UPI ID copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy. Please copy manually.");
    }
  }, [upiId]);

  const upiUri = buildUpiUri(upiId, merchantName, amount, orderNumber);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative w-full max-w-sm rounded-2xl bg-card border border-border/60 p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close payment modal"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="space-y-5">
            {/* Header */}
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold">Complete Payment</h2>
              <p className="text-sm text-muted-foreground">
                Scan QR code to pay <span className="font-semibold text-foreground">{formatCurrency(amount)}</span>
              </p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center bg-white rounded-xl p-4">
              <QRCode
                value={upiUri}
                size={200}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>

            {/* UPI ID */}
            {upiId && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">Or pay to UPI ID</p>
                <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-3 py-2">
                  <span className="flex-1 text-sm font-mono truncate">{upiId}</span>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 rounded-md p-1.5 hover:bg-accent transition-colors"
                    aria-label="Copy UPI ID"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Order info */}
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground">
                Order <span className="font-mono font-medium text-foreground">{orderNumber}</span>
              </p>
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              <Button
                onClick={onPaid}
                className="w-full"
                size="lg"
              >
                I Have Paid
              </Button>

              {whatsappNumber && onWhatsApp && (
                <Button
                  onClick={onWhatsApp}
                  variant="outline"
                  className="w-full gap-2"
                  size="lg"
                >
                  <MessageCircle className="h-4 w-4" />
                  Pay via WhatsApp
                </Button>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              After payment, click &quot;I Have Paid&quot; and we&apos;ll verify your payment shortly.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
