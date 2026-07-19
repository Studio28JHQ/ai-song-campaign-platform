"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/security/TurnstileWidget";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { VOICE_OPTIONS, type Voice } from "@/domain/lyrics/types";
import { FIELD_LIMITS } from "@/shared/validation/text";
import { plainTextField } from "@/shared/validation/zodFields";
import { LyricsGenerationWaitingMessages } from "./LyricsGenerationWaitingMessages";

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
  // Sprint v1.1 — AI Musical Direction.
  voice: z.enum(VOICE_OPTIONS),
});

type FormValues = z.infer<typeof formSchema>;

export interface LyricsGenerationSubmitValues {
  moodId: string;
  moodName: string;
  moodDescription?: string;
  parentMessage: string;
  turnstileToken: string;
  /** Sprint v1.1 — AI Musical Direction. Only ever used to build the Mureka prompt — never sent to Claude. */
  voice: Voice;
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
    defaultValues: {
      moodId: MOODS[0].id,
      parentMessage: "",
      turnstileToken: "",
      voice: "FEMALE",
    },
  });
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  // This form doesn't call the API itself — `onSubmit` (owned by
  // `LyricsWorkflow`) does, and reports failure back via `errorMessage`,
  // which it always clears before a new attempt. So a transition to a new
  // truthy value here reliably means "the previous submission just failed"
  // (Turnstile rejection, rate limit, moderation rejection, ...) — the
  // submitted token is spent either way, so pull a fresh one from the same
  // widget before another submit is allowed. Not `shouldValidate: true`:
  // `handleSubmit`'s own resolver already re-validates on the next submit
  // attempt, and eagerly showing "Completa la verificación de seguridad."
  // right on top of `errorMessage`'s own banner would be redundant. See the
  // Turnstile token reuse investigation this fixes.
  useEffect(() => {
    if (errorMessage) {
      setValue("turnstileToken", "");
      turnstileRef.current?.reset();
    }
  }, [errorMessage, setValue]);

  function submit(values: FormValues) {
    const mood = MOODS.find((candidate) => candidate.id === values.moodId) ?? MOODS[0];
    onSubmit({
      moodId: mood.id,
      moodName: mood.name,
      moodDescription: mood.description,
      parentMessage: values.parentMessage,
      turnstileToken: values.turnstileToken,
      voice: values.voice,
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
        <p
          role="alert"
          className="rounded-lg border-l-4 border-destructive bg-[var(--destructive-background)] px-3 py-2 text-sm text-foreground"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="moodId">Elige el estilo</Label>
        <select
          id="moodId"
          className="h-12 w-full rounded-xl border border-input bg-card px-4 text-base outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/25 md:text-sm"
          {...register("moodId")}
        >
          {MOODS.map((mood) => (
            <option key={mood.id} value={mood.id}>
              {mood.label}
            </option>
          ))}
        </select>
        {errors.moodId ? (
          <p role="alert" className="text-sm text-[var(--destructive-text)]">
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
          className="w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/25 md:text-sm"
          {...register("parentMessage")}
        />
        {errors.parentMessage ? (
          <p
            id="parentMessage-error"
            role="alert"
            className="text-sm text-[var(--destructive-text)]"
          >
            {translateMessageFieldError(errors.parentMessage.message)}
          </p>
        ) : null}
      </div>

      <p className="text-caption text-muted-foreground">Intentos restantes: {remainingAttempts}</p>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          ¿Quién te gustaría que interpretara la canción?
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          <Label className="flex items-center gap-2 text-sm font-normal">
            <input type="radio" value="FEMALE" className="size-4" {...register("voice")} />
            Voz femenina
          </Label>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <input type="radio" value="MALE" className="size-4" {...register("voice")} />
            Voz masculina
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          onVerify={(token) => setValue("turnstileToken", token, { shouldValidate: true })}
          onExpire={() => setValue("turnstileToken", "", { shouldValidate: true })}
          onError={() => setValue("turnstileToken", "", { shouldValidate: true })}
        />
        {errors.turnstileToken ? (
          <p role="alert" className="text-sm text-[var(--destructive-text)]">
            {errors.turnstileToken.message}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting || noAttemptsLeft}
        className="mt-2 h-12 w-full rounded-full text-base font-semibold shadow-md shadow-primary/25 hover:bg-[var(--primary-hover)]"
      >
        {isSubmitting ? (
          <>
            <span
              role="status"
              aria-label="Generando"
              className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
            />
            Generando tu letra...
          </>
        ) : (
          "Crear la letra"
        )}
      </Button>

      {isSubmitting ? <LyricsGenerationWaitingMessages babyName={babyName} /> : null}
    </form>
  );
}
