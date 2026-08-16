import { useCallback } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { normalizeIndianPhone, extractDigitsForInput } from "@/utils/phone";

// ============================================================================
// PhoneInput — +91 | 10-digit Indian mobile number
// ============================================================================
//
// The +91 prefix is fixed and non-editable. The customer enters only the
// 10-digit number. On change, the parent receives the raw 10-digit string
// (e.g. "8801756151"). Use normalizeIndianPhone() before submitting to
// the backend.
//
// Handles paste of +91XXXXXXXXXX, 91XXXXXXXXXX, or plain 10-digit input.
// ============================================================================

interface PhoneInputProps {
  /** The raw 10-digit phone number (without +91). */
  value: string;
  /** Called with the raw 10-digit string on every change. */
  onChange: (value: string) => void;
  /** Whether the field is disabled. */
  disabled?: boolean;
  /** Placeholder for the 10-digit input. */
  placeholder?: string;
  /** Additional CSS classes for the outer container. */
  className?: string;
  /** Additional CSS classes for the digit input. */
  inputClassName?: string;
  /** Error state — applies destructive border. */
  error?: boolean;
  /** HTML id for the input element. */
  id?: string;
}

export function PhoneInput({
  value,
  onChange,
  disabled = false,
  placeholder = "8801756151",
  className,
  inputClassName,
  error = false,
  id,
}: PhoneInputProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;

      // If user pastes a full number with country code, extract the 10 digits
      const digits = extractDigitsForInput(raw);
      if (digits) {
        onChange(digits);
        return;
      }

      // Allow only digits, max 10
      const cleaned = raw.replace(/\D/g, "").slice(0, 10);
      onChange(cleaned);
    },
    [onChange]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData("text");
      const digits = extractDigitsForInput(pasted);
      if (digits) {
        e.preventDefault();
        onChange(digits);
      }
    },
    [onChange]
  );

  return (
    <div className={cn("flex items-center", className)}>
      {/* Fixed +91 prefix */}
      <div
        className={cn(
          "flex h-9 items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm font-medium text-muted-foreground",
          error && "border-destructive"
        )}
      >
        +91
      </div>
      {/* Editable 10-digit input */}
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={10}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        disabled={disabled}
        className={cn(
          "rounded-l-none",
          error && "border-destructive",
          inputClassName
        )}
      />
    </div>
  );
}
