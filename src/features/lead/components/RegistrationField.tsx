"use client";

import { useId } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RegistrationFieldProps {
  label: string;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLElement>["inputMode"];
  autoComplete?: string;
  error?: string;
  registration: UseFormRegisterReturn;
}

/**
 * One labeled input with its own error message, wired for accessibility:
 * label/input association via `htmlFor`/`id`, `aria-invalid` and
 * `aria-describedby` pointing at the error text when present.
 */
export function RegistrationField({
  label,
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
  error,
  registration,
}: RegistrationFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...registration}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
