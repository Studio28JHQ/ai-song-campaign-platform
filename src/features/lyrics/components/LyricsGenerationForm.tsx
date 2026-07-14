"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
 */
const MOODS = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    name: "Joyful",
    description: "upbeat and cheerful",
  },
  { id: "10000000-0000-0000-0000-000000000002", name: "Calm", description: "soft and soothing" },
  { id: "10000000-0000-0000-0000-000000000003", name: "Playful", description: "fun and bouncy" },
  {
    id: "10000000-0000-0000-0000-000000000004",
    name: "Sentimental",
    description: "warm and heartfelt",
  },
] as const;

// Client-side validation built from the same Sprint 8.1 hardening rules
// (`@/shared/validation`) enforced by the API and application layers.
const formSchema = z.object({
  moodId: z.string().min(1, "Select a mood."),
  parentMessage: plainTextField("Your message", FIELD_LIMITS.lyricsMessage),
});

type FormValues = z.infer<typeof formSchema>;

export interface LyricsGenerationSubmitValues {
  moodId: string;
  moodName: string;
  moodDescription?: string;
  parentMessage: string;
}

interface LyricsGenerationFormProps {
  babyName: string;
  remainingAttempts: number;
  isSubmitting: boolean;
  errorMessage?: string | null;
  onSubmit: (values: LyricsGenerationSubmitValues) => void;
}

export function LyricsGenerationForm({
  babyName,
  remainingAttempts,
  isSubmitting,
  errorMessage,
  onSubmit,
}: LyricsGenerationFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { moodId: MOODS[0].id, parentMessage: "" },
  });

  function submit(values: FormValues) {
    const mood = MOODS.find((candidate) => candidate.id === values.moodId) ?? MOODS[0];
    onSubmit({
      moodId: mood.id,
      moodName: mood.name,
      moodDescription: mood.description,
      parentMessage: values.parentMessage,
    });
  }

  const noAttemptsLeft = remainingAttempts <= 0;

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-label text-muted-foreground">Baby name</span>
        <p className="text-title font-semibold text-foreground">{babyName}</p>
      </div>

      {errorMessage ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="moodId">Selected mood</Label>
        <select
          id="moodId"
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          {...register("moodId")}
        >
          {MOODS.map((mood) => (
            <option key={mood.id} value={mood.id}>
              {mood.name}
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
        <Label htmlFor="parentMessage">Your message for the song</Label>
        <textarea
          id="parentMessage"
          placeholder="Tell us about a memory, a feeling, or something you want the song to celebrate..."
          rows={4}
          maxLength={FIELD_LIMITS.lyricsMessage}
          aria-invalid={Boolean(errors.parentMessage)}
          aria-describedby={errors.parentMessage ? "parentMessage-error" : undefined}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          {...register("parentMessage")}
        />
        {errors.parentMessage ? (
          <p id="parentMessage-error" role="alert" className="text-sm text-destructive">
            {errors.parentMessage.message}
          </p>
        ) : null}
      </div>

      <p className="text-caption text-muted-foreground">Remaining attempts: {remainingAttempts}</p>

      <Button type="submit" disabled={isSubmitting || noAttemptsLeft} className="mt-2 w-full">
        {isSubmitting ? "Generating..." : "Generate Lyrics"}
      </Button>
    </form>
  );
}
