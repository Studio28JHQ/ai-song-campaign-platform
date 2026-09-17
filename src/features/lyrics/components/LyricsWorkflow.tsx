"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getLeadSession,
  type LeadSessionSongStatus,
} from "@/features/lead/services/getLeadSession";
import { useApproveLyrics } from "../hooks/useApproveLyrics";
import { useGenerateLyrics } from "../hooks/useGenerateLyrics";
import { ApprovedLyricsStatus } from "./ApprovedLyricsStatus";
import {
  LyricsGenerationForm,
  resolveMood,
  type LyricsGenerationSubmitValues,
} from "./LyricsGenerationForm";
import { LyricsReviewPanel } from "./LyricsReviewPanel";

interface Session {
  babyName: string;
}

interface CurrentLyrics {
  id: string;
  content: string;
  version: number;
}

interface ApprovedLyricsRecord {
  content: string;
  version: number;
}

interface LyricsWorkflowProps {
  maxAttempts: number;
  supportEmail: string;
  turnstileSiteKey: string;
}

/**
 * Orchestrates the full lyrics generation + review flow: reads the
 * current session state from the backend (see `GET /api/leads/session` —
 * GATE 6.6), drives generation/regeneration through `useGenerateLyrics`,
 * and approval through `useApproveLyrics`. Renders the input form until a
 * version is approved by Claude (see docs/Product/User_Flow.md — Lyrics
 * Review), then the review panel. A version generated in an earlier visit
 * but never approved is restored from that same backend state — along
 * with the request that produced it — so the emailed resume link returns
 * the parent to the step they actually left off at, with every action
 * there behaving exactly as it would have in the uninterrupted flow.
 *
 * Once a version has been approved, it is immutable — and the backend,
 * not client-side storage, is what makes this true: the Lead is
 * identified only by an HttpOnly session cookie, and
 * `GenerateLyricsForLeadUseCase` itself now refuses to generate another
 * version once one is approved. This component never shows the
 * generation form or review panel again for this lead, even on a fresh
 * mount (e.g. navigating back from `/song`, a refresh, or clearing
 * browser storage), because every mount re-asks the backend rather than
 * trusting anything cached client-side.
 */
export function LyricsWorkflow({
  maxAttempts,
  supportEmail,
  turnstileSiteKey,
}: LyricsWorkflowProps) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState(0);
  const [lyrics, setLyrics] = useState<CurrentLyrics | null>(null);
  const [approvedLyrics, setApprovedLyrics] = useState<ApprovedLyricsRecord | null | undefined>(
    undefined,
  );
  const [songStatus, setSongStatus] = useState<LeadSessionSongStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<LyricsGenerationSubmitValues | null>(null);

  const { submit: submitGenerate, isSubmitting: isGenerating } = useGenerateLyrics();
  const { submit: submitApprove, isSubmitting: isApproving } = useApproveLyrics();

  useEffect(() => {
    let cancelled = false;

    getLeadSession().then((state) => {
      if (cancelled) return;

      if (!state) {
        router.replace("/");
        return;
      }

      setSession({ babyName: state.babyName });
      setRemainingAttempts(state.remainingAttempts);
      setApprovedLyrics(state.approvedLyrics);
      // Restores a version generated in an earlier visit that the parent
      // never approved, so arriving here again — a refresh, a new device,
      // or the emailed resume link — shows the review panel for that exact
      // version instead of an empty form that would silently spend another
      // attempt re-generating what they already had. `approvedLyrics` is
      // still checked first when rendering below.
      const pending = state.pendingLyrics ?? null;
      setLyrics(pending);

      // Rebuilds the request that produced that version, so "Quiero otra
      // versión" regenerates with the same parameters here exactly as it
      // does in the uninterrupted flow — same mood, same message, same
      // voice. `moodName`/`moodDescription` come from `resolveMood`, the
      // same mapping `LyricsGenerationForm` applies to its own submit, so
      // the rebuilt request is indistinguishable from one the form sent.
      // No `turnstileToken`: the route verifies Turnstile only on a
      // lead's first generation, and this lead already has a version.
      if (pending?.parentMessage) {
        const mood = resolveMood(pending.moodId);
        setLastRequest({
          moodId: mood.id,
          moodName: mood.name,
          moodDescription: mood.description,
          parentMessage: pending.parentMessage,
          voice: pending.voice,
        });
      }
      setSongStatus(state.song?.status ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleGenerate(values: LyricsGenerationSubmitValues) {
    if (!session) return;

    setErrorMessage(null);
    setLastRequest(values);

    const outcome = await submitGenerate(values);

    if (!outcome.success) {
      setErrorMessage(outcome.message);
      return;
    }

    setRemainingAttempts(outcome.result.remainingAttempts);

    if (!outcome.result.approved || !outcome.result.lyrics) {
      setLyrics(null);
      setErrorMessage(
        outcome.result.reason ??
          "Este mensaje no pudo ser aprobado. Por favor revísalo e inténtalo de nuevo.",
      );
      return;
    }

    setLyrics({
      id: outcome.result.lyrics.id,
      content: outcome.result.lyrics.content,
      version: outcome.result.lyrics.version,
    });
  }

  async function handleGenerateAgain() {
    // `lastRequest` is set both by a generation made in this session and
    // by restoring a pending version above, so this needs no special
    // case for a resumed visit. It stays null only for a version
    // generated before `parentMessage` was persisted (see
    // `PendingLyricsSummary`), which cannot be regenerated from at all.
    if (lastRequest) {
      await handleGenerate(lastRequest);
    }
  }

  async function handleApprove() {
    if (!lyrics) return;

    const outcome = await submitApprove({ lyricsId: lyrics.id });
    if (!outcome.success) {
      setErrorMessage(outcome.message);
      return;
    }

    setApprovedLyrics({ content: lyrics.content, version: lyrics.version });
  }

  if (!session || approvedLyrics === undefined) {
    return null;
  }

  if (approvedLyrics) {
    return (
      <ApprovedLyricsStatus
        content={approvedLyrics.content}
        version={approvedLyrics.version}
        maxAttempts={maxAttempts}
        songStatus={songStatus}
        supportEmail={supportEmail}
      />
    );
  }

  if (lyrics) {
    return (
      <LyricsReviewPanel
        content={lyrics.content}
        version={lyrics.version}
        maxAttempts={maxAttempts}
        remainingAttempts={remainingAttempts}
        isGenerating={isGenerating}
        isApproving={isApproving}
        errorMessage={errorMessage}
        onApprove={handleApprove}
        onGenerateAgain={handleGenerateAgain}
      />
    );
  }

  return (
    <LyricsGenerationForm
      babyName={session.babyName}
      remainingAttempts={remainingAttempts}
      isSubmitting={isGenerating}
      errorMessage={errorMessage}
      turnstileSiteKey={turnstileSiteKey}
      onSubmit={handleGenerate}
    />
  );
}
