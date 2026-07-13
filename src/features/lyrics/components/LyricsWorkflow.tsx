"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BABY_NAME_STORAGE_KEY,
  LEAD_ID_STORAGE_KEY,
  REMAINING_ATTEMPTS_STORAGE_KEY,
} from "@/features/lead/hooks/useRegisterLead";
import { useApproveLyrics } from "../hooks/useApproveLyrics";
import { useGenerateLyrics } from "../hooks/useGenerateLyrics";
import { LyricsGenerationForm, type LyricsGenerationSubmitValues } from "./LyricsGenerationForm";
import { LyricsReviewPanel } from "./LyricsReviewPanel";

interface Session {
  leadId: string;
  babyName: string;
}

interface CurrentLyrics {
  id: string;
  content: string;
  version: number;
}

/**
 * Orchestrates the full lyrics generation + review flow: reads the
 * registration session, drives generation/regeneration through
 * `useGenerateLyrics`, and approval through `useApproveLyrics`. Renders
 * the input form until a version is approved by Claude (see
 * docs/Product/User_Flow.md — Lyrics Review), then the review panel.
 */
export function LyricsWorkflow() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState(0);
  const [lyrics, setLyrics] = useState<CurrentLyrics | null>(null);
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
    }
  }

  if (!session) {
    return null;
  }

  if (lyrics) {
    return (
      <LyricsReviewPanel
        content={lyrics.content}
        version={lyrics.version}
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
