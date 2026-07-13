"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useRegisterLead } from "../hooks/useRegisterLead";
import { RegistrationField } from "./RegistrationField";

/**
 * V1 has exactly one campaign and no campaign-selection UI (see
 * PROJECT_MANIFEST.md — "Not intended for multiple clients"). This
 * placeholder id (UUID-shaped, since `Campaign.id` is a `@db.Uuid` column)
 * will be replaced once campaign management exists.
 */
const DEFAULT_CAMPAIGN_ID = "00000000-0000-0000-0000-000000000000";

// Client-side UX validation only — instant feedback before a network
// round-trip. The server (Application + Domain layers) remains the
// authoritative source of truth for every business rule.
const registrationFormSchema = z.object({
  parentName: z.string().trim().min(1, "Enter the parent's name."),
  babyName: z.string().trim().min(1, "Enter the baby's name."),
  babyAge: z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) > 0), {
      message: "Enter a positive whole number of months.",
    }),
  city: z.string().trim(),
  email: z.string().trim().min(1, "Enter an email address.").email("Enter a valid email address."),
  phone: z.string().trim(),
});

type RegistrationFormValues = z.infer<typeof registrationFormSchema>;

const defaultValues: RegistrationFormValues = {
  parentName: "",
  babyName: "",
  babyAge: "",
  city: "",
  email: "",
  phone: "",
};

export function RegistrationForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegistrationFormValues>({
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
      city: values.city === "" ? undefined : values.city,
      email: values.email,
      phone: values.phone === "" ? undefined : values.phone,
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
        error={errors.parentName?.message}
        registration={register("parentName")}
      />

      <RegistrationField
        label="Baby name"
        placeholder="Baby Doe"
        autoComplete="off"
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
        error={errors.city?.message}
        registration={register("city")}
      />

      <RegistrationField
        label="Email"
        placeholder="jane@example.com"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        registration={register("email")}
      />

      <RegistrationField
        label="Phone"
        placeholder="+1 555 123 4567"
        type="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        registration={register("phone")}
      />

      <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
        {isSubmitting ? "Registering..." : "Register"}
      </Button>
    </form>
  );
}
