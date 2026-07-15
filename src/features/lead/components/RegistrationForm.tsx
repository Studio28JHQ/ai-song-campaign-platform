"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { Button } from "@/components/ui/button";
import { FIELD_LIMITS } from "@/shared/validation/text";
import {
  emailField,
  optionalPhoneField,
  optionalPlainTextField,
  plainTextField,
} from "@/shared/validation/zodFields";
import { useRegisterLead } from "../hooks/useRegisterLead";
import { RegistrationField } from "./RegistrationField";

/**
 * V1 has exactly one campaign and no campaign-selection UI (see
 * PROJECT_MANIFEST.md — "Not intended for multiple clients"). This
 * placeholder id (UUID-shaped, since `Campaign.id` is a `@db.Uuid` column)
 * will be replaced once campaign management exists.
 */
const DEFAULT_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000000";

// Client-side validation — instant feedback before a network round-trip,
// built from the same Sprint 8.1 hardening rules (`@/shared/validation`)
// enforced by the API and domain layers. The server remains the
// authoritative source of truth for every business rule.
const registrationFormSchema = z.object({
  parentName: plainTextField("Parent's name", FIELD_LIMITS.parentName),
  babyName: plainTextField("Baby's name", FIELD_LIMITS.babyName),
  babyAge: z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) > 0), {
      message: "Enter a positive whole number of months.",
    }),
  city: optionalPlainTextField("City", FIELD_LIMITS.city),
  email: emailField(),
  phone: optionalPhoneField(),
  turnstileToken: z.string().min(1, "Please complete the verification challenge."),
});

type RegistrationFormInput = z.input<typeof registrationFormSchema>;
type RegistrationFormValues = z.output<typeof registrationFormSchema>;

const defaultValues: RegistrationFormInput = {
  parentName: "",
  babyName: "",
  babyAge: "",
  city: "",
  email: "",
  phone: "",
  turnstileToken: "",
};

interface RegistrationFormProps {
  turnstileSiteKey: string;
}

export function RegistrationForm({ turnstileSiteKey }: RegistrationFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<RegistrationFormInput, unknown, RegistrationFormValues>({
    resolver: zodResolver(registrationFormSchema),
    defaultValues,
  });
  const { submit, isSubmitting } = useRegisterLead();
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(values: RegistrationFormValues) {
    setFormError(null);

    const outcome = await submit({
      campaignId: DEFAULT_CAMPAIGN_ID,
      parentName: values.parentName,
      babyName: values.babyName,
      babyAge: values.babyAge === "" ? undefined : Number(values.babyAge),
      city: values.city,
      email: values.email,
      phone: values.phone,
      turnstileToken: values.turnstileToken,
    });

    if (!outcome.success) {
      if (outcome.code === "email_already_registered") {
        setError("email", { type: "server", message: outcome.message });
      } else {
        setFormError(outcome.message);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <RegistrationField
        label="Parent name"
        placeholder="Jane Doe"
        autoComplete="name"
        maxLength={FIELD_LIMITS.parentName}
        error={errors.parentName?.message}
        registration={register("parentName")}
      />

      <RegistrationField
        label="Baby name"
        placeholder="Baby Doe"
        autoComplete="off"
        maxLength={FIELD_LIMITS.babyName}
        error={errors.babyName?.message}
        registration={register("babyName")}
      />

      <RegistrationField
        label="Baby age (months)"
        placeholder="6"
        type="number"
        inputMode="numeric"
        autoComplete="off"
        error={errors.babyAge?.message}
        registration={register("babyAge")}
      />

      <RegistrationField
        label="City"
        placeholder="Austin"
        autoComplete="address-level2"
        maxLength={FIELD_LIMITS.city}
        error={errors.city?.message}
        registration={register("city")}
      />

      <RegistrationField
        label="Email"
        placeholder="jane@example.com"
        type="email"
        autoComplete="email"
        maxLength={FIELD_LIMITS.email}
        error={errors.email?.message}
        registration={register("email")}
      />

      <RegistrationField
        label="Phone"
        placeholder="+1 555 123 4567"
        type="tel"
        autoComplete="tel"
        maxLength={FIELD_LIMITS.phone}
        error={errors.phone?.message}
        registration={register("phone")}
      />

      <div className="flex flex-col gap-1.5">
        <TurnstileWidget
          siteKey={turnstileSiteKey}
          onVerify={(token) => setValue("turnstileToken", token, { shouldValidate: true })}
          onExpire={() => setValue("turnstileToken", "", { shouldValidate: true })}
          onError={() => setValue("turnstileToken", "", { shouldValidate: true })}
        />
        {errors.turnstileToken ? (
          <p role="alert" className="text-sm text-destructive">
            {errors.turnstileToken.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
        {isSubmitting ? "Registering..." : "Register"}
      </Button>
    </form>
  );
}
