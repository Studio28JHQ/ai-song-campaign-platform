"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FIELD_LIMITS } from "@/shared/validation/text";
import { plainTextField } from "@/shared/validation/zodFields";

/**
 * V1 provides exactly four predefined moods (see
 * docs/Product/Business_Rules.md — Mood Rules). No Mood management UI or
 * repository exists yet, so these ids are fixed placeholders that a
 * future Mood-seeding task must match — the same kind of simplification
 * as `DEFAULT_CAMPAIGN_ID` in the Lead feature.
 *
 * `name`/`description` stay in English and are submitted to the API
 * exactly as before (Sprint UI-1 — "no backend/API changes"): they flow
 * into `GenerateLyricsForLeadUseCase`'s Claude prompt and are persisted
 * on `Lyrics.prompt` server-side, so changing their *value* would be a
 * backend-observable behavior change even though this file is
 * frontend-only. `label` is the only new, Spanish, display-only field —
 * what the parent actually sees in the dropdown.
 */
const MOODS = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    name: "Joyful",
    description: "upbeat and cheerful",
    label: "Alegre",
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    name: "Calm",
    description: "soft and soothing",
    label: "Tranquilo",
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    name: "Playful",
    description: "fun and bouncy",
    label: "Juguetón",
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    name: "Sentimental",
    description: "warm and heartfelt",
    label: "Sentimental",
  },
] as const;

// Client-side validation built from the same Sprint 8.1 hardening rules
// (`@/shared/validation`) enforced by the API and application layers.
const formSchema = z.object({
  moodId: z.string().min(1, "Elige un estilo."),
  parentMessage: plainTextField("Your message", FIELD_LIMITS.lyricsMessage),
  turnstileToken: z.string().min(1, "Completa la verificación de seguridad."),
});

type FormValues = z.infer<typeof formSchema>;

export interface LyricsGenerationSubmitValues {
  moodId: string;
  moodName: string;
  moodDescription?: string;
  parentMessage: string;
  turnstileToken: string;
}

interface LyricsGenerationFormProps {
  babyName: string;
  remainingAttempts: number;
  isSubmitting: boolean;
  errorMessage?: string | null;
  turnstileSiteKey: string;
  onSubmit: (values: LyricsGenerationSubmitValues) => void;
}

/**
 * `parentMessage`'s "required"/"too long"/etc. validation message comes
 * from the *shared* `src/shared/validation/text.ts` module (also used
 * server-side), out of scope for translation this sprint — see the same
 * note in `RegistrationForm.tsx`. Re-translated here, frontend-only,
 * for the one field this form has that goes through it.
 */
function translateMessageFieldError(message: string | undefined): string | undefined {
  if (!message) return message;
  if (message === "Your message is required.") return "Tu mensaje es obligatorio.";
  const tooLong = message.match(/^Your message must be at most (\d+) characters\.$/);
  if (tooLong) return `Tu mensaje debe tener como máximo ${tooLong[1]} caracteres.`;
  if (message === "Your message contains characters that are not allowed.") {
    return "Tu mensaje contiene caracteres no permitidos.";
  }
  if (message === "Your message cannot contain HTML tags or the characters < and >.") {
    return "Tu mensaje no puede contener etiquetas HTML ni los caracteres < y >.";
  }
  return message;
}

export function LyricsGenerationForm({
  babyName,
  remainingAttempts,
  isSubmitting,
  errorMessage,
  turnstileSiteKey,
  onSubmit,
}: LyricsGenerationFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { moodId: MOODS[0].id, parentMessage: "", turnstileToken: "" },
  });

  function submit(values: FormValues) {
    const mood = MOODS.find((candidate) => candidate.id === values.moodId) ?? MOODS[0];
    onSubmit({
      moodId: mood.id,
      moodName: mood.name,
      moodDescription: mood.description,
      parentMessage: values.parentMessage,
      turnstileToken: values.turnstileToken,
    });
  }

  const noAttemptsLeft = remainingAttempts <= 0;

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-label text-muted-foreground">Nombre del bebé</span>
        <p className="font-heading text-title font-semibold text-foreground">{babyName}</p>
      </div>

      {errorMessage ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="moodId">Elige el estilo</Label>
        <select
          id="moodId"
          className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          {...register("moodId")}
        >
          {MOODS.map((mood) => (
            <option key={mood.id} value={mood.id}>
              {mood.label}
            </option>
          ))}
        </select>
        {errors.moodId ? (
          <p role="alert" className="text-sm text-destructive">
            {errors.moodId.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parentMessage">Tu mensaje para la canción</Label>
        <textarea
          id="parentMessage"
          placeholder="Cuéntanos un recuerdo, un sentimiento o algo especial que quieras celebrar en la canción..."
          rows={4}
          maxLength={FIELD_LIMITS.lyricsMessage}
          aria-invalid={Boolean(errors.parentMessage)}
          aria-describedby={errors.parentMessage ? "parentMessage-error" : undefined}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          {...register("parentMessage")}
        />
        {errors.parentMessage ? (
          <p id="parentMessage-error" role="alert" className="text-sm text-destructive">
            {translateMessageFieldError(errors.parentMessage.message)}
          </p>
        ) : null}
      </div>

      <p className="text-caption text-muted-foreground">Intentos restantes: {remainingAttempts}</p>

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
        disabled={isSubmitting || noAttemptsLeft}
        className="mt-2 h-11 w-full rounded-full text-base"
      >
        {isSubmitting ? "Creando..." : "Crear letra"}
      </Button>
    </form>
  );
}
