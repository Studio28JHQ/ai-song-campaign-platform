"use client";

import { type ReactNode, useId } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { CampaignLabel } from "@/components/campaign/CampaignLabel";
import { CampaignSelect } from "@/components/campaign/CampaignSelect";

interface CampaignSelectFieldProps {
  label: string;
  error?: string;
  icon?: ReactNode;
  registration: UseFormRegisterReturn;
  children: ReactNode;
}

/**
 * `CampaignField`'s sibling for a Select field — same labeled/error-aware
 * wiring (`htmlFor`/`id`, `aria-invalid`, `aria-describedby`), rendering
 * `CampaignSelect` with the caller's own `<option>`s instead of an input.
 */
export function CampaignSelectField({
  label,
  error,
  icon,
  registration,
  children,
}: CampaignSelectFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <CampaignLabel htmlFor={id}>{label}</CampaignLabel>
      <CampaignSelect
        id={id}
        icon={icon}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...registration}
      >
        {children}
      </CampaignSelect>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-[var(--destructive-text)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
