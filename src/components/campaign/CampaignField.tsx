"use client";

import { type ReactNode, useId } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { CampaignInput } from "@/components/campaign/CampaignInput";
import { CampaignLabel } from "@/components/campaign/CampaignLabel";

interface CampaignFieldProps {
  label: string;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLElement>["inputMode"];
  autoComplete?: string;
  maxLength?: number;
  error?: string;
  icon?: ReactNode;
  registration: UseFormRegisterReturn;
}

/**
 * Sprint UI-3A — Landing Experience. One labeled campaign-styled input
 * with its own error message — the same accessibility wiring
 * `RegistrationField` (Sprint UI-1) had: label/input association via
 * `htmlFor`/`id`, `aria-invalid` and `aria-describedby` pointing at the
 * error text when present. Supersedes `RegistrationField` as the
 * landing page's field component; the same `react-hook-form`
 * `registration` spread means no form-behavior change at all, only
 * presentation.
 */
export function CampaignField({
  label,
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
  maxLength,
  error,
  icon,
  registration,
}: CampaignFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <CampaignLabel htmlFor={id}>{label}</CampaignLabel>
      <CampaignInput
        id={id}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        icon={icon}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...registration}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-[var(--destructive-text)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
