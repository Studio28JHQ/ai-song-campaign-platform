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
// authoritative source of truth for every business rule. Field labels
// passed in here stay in English ("Parent's name", etc.) — they flow
// into the *shared* `src/shared/validation/` module, also used by the
// API and domain layers, which this sprint's "no backend/domain
// changes" constraint puts out of scope for translation. `translateFieldError`
// below re-translates the resulting message for display, purely on the
// frontend, without touching that shared module.
const registrationFormSchema = z.object({
  parentName: plainTextField("Parent's name", FIELD_LIMITS.parentName),
  babyName: plainTextField("Baby's name", FIELD_LIMITS.babyName),
  babyAge: z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) > 0), {
      message: "Ingresa un número entero positivo de meses.",
    }),
  city: optionalPlainTextField("City", FIELD_LIMITS.city),
  email: emailField(),
  phone: optionalPhoneField(),
  turnstileToken: z.string().min(1, "Completa la verificación de seguridad."),
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

/**
 * Translates the finite set of messages `src/shared/validation/text.ts`
 * (`describeTextValidationFailure`) and `zodFields.ts` (`emailField`/
 * `optionalPhoneField`) can produce — English field label plus a fixed
 * sentence shape — into Spanish, purely at render time. Frontend-only:
 * the shared module itself, and every message the server can return
 * over the wire, are untouched. Any message that doesn't match a known
 * shape (e.g. the shared module's wording changes later) is returned
 * as-is rather than mistranslated.
 */
const FIELD_LABEL_ES: Record<string, string> = {
  "Parent's name": "Tu nombre",
  "Baby's name": "Nombre del bebé",
  City: "Ciudad",
  Email: "Correo electrónico",
  Phone: "Teléfono",
};

function translateFieldError(message: string | undefined): string | undefined {
  if (!message) return message;

  for (const [labelEn, labelEs] of Object.entries(FIELD_LABEL_ES)) {
    if (message === `${labelEn} is required.`) {
      return `${labelEs} es obligatorio.`;
    }
    const tooLong = message.match(
      new RegExp(
        `^${labelEn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} must be at most (\\d+) characters\\.$`,
      ),
    );
    if (tooLong) {
      return `${labelEs} debe tener como máximo ${tooLong[1]} caracteres.`;
    }
    if (message === `${labelEn} contains characters that are not allowed.`) {
      return `${labelEs} contiene caracteres no permitidos.`;
    }
    if (message === `${labelEn} cannot contain HTML tags or the characters < and >.`) {
      return `${labelEs} no puede contener etiquetas HTML ni los caracteres < y >.`;
    }
  }

  if (message === "Enter a valid email address.") return "Ingresa un correo electrónico válido.";
  if (message === "Enter a valid phone number.") return "Ingresa un número de teléfono válido.";

  return message;
}

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
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <RegistrationField
        label="Tu nombre"
        placeholder="Ej. María Fernández"
        autoComplete="name"
        maxLength={FIELD_LIMITS.parentName}
        error={translateFieldError(errors.parentName?.message)}
        registration={register("parentName")}
      />

      <RegistrationField
        label="Nombre del bebé"
        placeholder="Ej. Sofía"
        autoComplete="off"
        maxLength={FIELD_LIMITS.babyName}
        error={translateFieldError(errors.babyName?.message)}
        registration={register("babyName")}
      />

      <RegistrationField
        label="Edad del bebé (meses)"
        placeholder="6"
        type="number"
        inputMode="numeric"
        autoComplete="off"
        error={translateFieldError(errors.babyAge?.message)}
        registration={register("babyAge")}
      />

      <RegistrationField
        label="Ciudad"
        placeholder="Ej. Guadalajara"
        autoComplete="address-level2"
        maxLength={FIELD_LIMITS.city}
        error={translateFieldError(errors.city?.message)}
        registration={register("city")}
      />

      <RegistrationField
        label="Correo electrónico"
        placeholder="maria@ejemplo.com"
        type="email"
        autoComplete="email"
        maxLength={FIELD_LIMITS.email}
        error={translateFieldError(errors.email?.message)}
        registration={register("email")}
      />

      <RegistrationField
        label="Teléfono"
        placeholder="+52 55 1234 5678"
        type="tel"
        autoComplete="tel"
        maxLength={FIELD_LIMITS.phone}
        error={translateFieldError(errors.phone?.message)}
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

      <Button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 h-11 w-full rounded-full text-base"
      >
        {isSubmitting ? "Registrando..." : "Registrarme"}
      </Button>
    </form>
  );
}
