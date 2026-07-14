"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BABY_NAME_STORAGE_KEY,
  LEAD_ID_STORAGE_KEY,
  REMAINING_ATTEMPTS_STORAGE_KEY,
} from "@/features/lead/hooks/useRegisterLead";
import { getSongStatus, type SongStatusValue } from "@/features/song/services/getSongStatus";
import { SONG_ID_STORAGE_KEY } from "@/features/song/hooks/useSongResult";
import { useApproveLyrics } from "../hooks/useApproveLyrics";
import { useGenerateLyrics } from "../hooks/useGenerateLyrics";
import { ApprovedLyricsStatus } from "./ApprovedLyricsStatus";
import { LyricsGenerationForm, type LyricsGenerationSubmitValues } from "./LyricsGenerationForm";
import { LyricsReviewPanel } from "./LyricsReviewPanel";

// Exported so a returning visit (e.g. the browser back button after song
// generation starts) can detect that this lead's lyrics are already
// approved and immutable, without a dedicated "fetch lead" endpoint —
// same convention as `SONG_ID_STORAGE_KEY` in the Song feature.
export const APPROVED_LYRICS_STORAGE_KEY = "approvedLyrics";

interface Session {
  leadId: string;
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
}

function readApprovedLyrics(): ApprovedLyricsRecord | null {
  const raw = window.sessionStorage.getItem(APPROVED_LYRICS_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ApprovedLyricsRecord;
  } catch {
    return null;
  }
}

/**
 * Orchestrates the full lyrics generation + review flow: reads the
 * registration session, drives generation/regeneration through
 * `useGenerateLyrics`, and approval through `useApproveLyrics`. Renders
 * the input form until a version is approved by Claude (see
 * docs/Product/User_Flow.md — Lyrics Review), then the review panel.
 *
 * Once a version has been approved, it is immutable: this component
 * never shows the generation form or review panel again for this lead,
 * even on a fresh mount (e.g. navigating back from `/song`) — see
 * `APPROVED_LYRICS_STORAGE_KEY`.
 */
export function LyricsWorkflow({ maxAttempts, supportEmail }: LyricsWorkflowProps) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState(0);
  const [lyrics, setLyrics] = useState<CurrentLyrics | null>(null);
  const [approvedLyrics, setApprovedLyrics] = useState<ApprovedLyricsRecord | null | undefined>(
    undefined,
  );
  const [songStatus, setSongStatus] = useState<SongStatusValue | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<LyricsGenerationSubmitValues | null>(null);

  const { submit: submitGenerate, isSubmitting: isGenerating } = useGenerateLyrics();
  const { submit: submitApprove, isSubmitting: isApproving } = useApproveLyrics();

  useEffect(() => {
    const leadId = window.sessionStorage.getItem(LEAD_ID_STORAGE_KEY);
    const babyName = window.sessionStorage.getItem(BABY_NAME_STORAGE_KEY);
    const storedAttempts = window.sessionStorage.getItem(REMAINING_ATTEMPTS_STORAGE_KEY);

    if (!leadId || !babyName) {
      router.replace("/");
      return;
    }

    setSession({ leadId, babyName });
    setRemainingAttempts(storedAttempts ? Number(storedAttempts) : 0);

    const existingApproval = readApprovedLyrics();
    setApprovedLyrics(existingApproval);

    if (!existingApproval) return;

    const songId = window.sessionStorage.getItem(SONG_ID_STORAGE_KEY);
    if (!songId) return;

    getSongStatus(songId)
      .then((result) => setSongStatus(result.status))
      .catch(() => {
        // A failed status check here does not mean the song failed — the
        // live source of truth is the Song Result screen's own polling;
        // this is only a one-time, best-effort summary.
      });
  }, [router]);

  async function handleGenerate(values: LyricsGenerationSubmitValues) {
    if (!session) return;

    setErrorMessage(null);
    setLastRequest(values);

    const outcome = await submitGenerate({ leadId: session.leadId, ...values });

    if (!outcome.success) {
      setErrorMessage(outcome.message);
      return;
    }

    window.sessionStorage.setItem(
      REMAINING_ATTEMPTS_STORAGE_KEY,
      String(outcome.result.remainingAttempts),
    );
    setRemainingAttempts(outcome.result.remainingAttempts);

    if (!outcome.result.approved || !outcome.result.lyrics) {
      setLyrics(null);
      setErrorMessage(
        outcome.result.reason ??
          "This message could not be approved. Please revise it and try again.",
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

    const record: ApprovedLyricsRecord = { content: lyrics.content, version: lyrics.version };
    window.sessionStorage.setItem(APPROVED_LYRICS_STORAGE_KEY, JSON.stringify(record));
    setApprovedLyrics(record);
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
      onSubmit={handleGenerate}
    />
  );
}
