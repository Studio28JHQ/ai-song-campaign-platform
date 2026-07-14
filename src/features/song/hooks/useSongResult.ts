"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BABY_NAME_STORAGE_KEY, LEAD_ID_STORAGE_KEY } from "@/features/lead/hooks/useRegisterLead";
import { GenerateSongError, generateSong } from "../services/generateSong";
import { getSongStatus, type SongStatusValue } from "../services/getSongStatus";

// Exported so a returning visit to `/song` (e.g. a page refresh) resumes
// polling the same Song instead of triggering a second generation — a
// lead can only ever generate one final song (see
// docs/Product/Business_Rules.md).
export const SONG_ID_STORAGE_KEY = "songId";

export const POLL_INTERVAL_MS = 5000;

const TERMINAL_STATUSES: ReadonlySet<SongStatusValue> = new Set(["COMPLETED", "FAILED"]);

export interface SongResultState {
  babyName: string | null;
  status: SongStatusValue | null;
  audioUrl: string | null;
  duration: number | null;
  errorMessage: string | null;
}

const INITIAL_STATE: SongResultState = {
  babyName: null,
  status: null,
  audioUrl: null,
  duration: null,
  errorMessage: null,
};

/**
 * Drives the Song Result page end to end: starts generation (or resumes
 * an in-flight one from a previous visit via `sessionStorage`), then
 * polls `GET /api/song/{songId}` every 5 seconds until the song reaches a
 * terminal status (`COMPLETED` or `FAILED`), at which point polling stops
 * immediately. There is no WebSocket or Server-Sent Events channel —
 * polling is the whole mechanism (see
 * docs/Architecture/System_Architecture.md).
 */
export function useSongResult(): SongResultState {
  const router = useRouter();
  const [state, setState] = useState<SongResultState>(INITIAL_STATE);

  useEffect(() => {
    const leadId = window.sessionStorage.getItem(LEAD_ID_STORAGE_KEY);
    const babyName = window.sessionStorage.getItem(BABY_NAME_STORAGE_KEY);

    if (!leadId) {
      router.replace("/");
      return;
    }

    setState((prev) => ({ ...prev, babyName }));

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    function stopPolling(): void {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    }

    function applyStatus(
      status: SongStatusValue,
      audioUrl?: string,
      duration?: number | null,
    ): void {
      if (cancelled) return;

      setState((prev) => ({
        ...prev,
        status,
        audioUrl: audioUrl ?? prev.audioUrl,
        duration: duration ?? prev.duration,
      }));

      if (TERMINAL_STATUSES.has(status)) {
        stopPolling();
      }
    }

    async function poll(songId: string): Promise<void> {
      try {
        const result = await getSongStatus(songId);
        applyStatus(result.status, result.audioUrl, result.duration);
      } catch {
        // A transient network/error response while polling is not the
        // same as the song failing — keep polling on the next tick
        // rather than surfacing a false FAILED state.
      }
    }

    async function start(): Promise<void> {
      const existingSongId = window.sessionStorage.getItem(SONG_ID_STORAGE_KEY);

      if (existingSongId) {
        await poll(existingSongId);
        if (!cancelled) {
          intervalId = setInterval(() => poll(existingSongId), POLL_INTERVAL_MS);
        }
        return;
      }

      try {
        // `leadId` was already validated non-null above, before `start`
        // is ever called.
        const result = await generateSong({ leadId: leadId as string });
        if (cancelled) return;

        window.sessionStorage.setItem(SONG_ID_STORAGE_KEY, result.songId);
        applyStatus(result.status as SongStatusValue);

        if (!cancelled && !TERMINAL_STATUSES.has(result.status as SongStatusValue)) {
          intervalId = setInterval(() => poll(result.songId), POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (cancelled) return;

        const message =
          error instanceof GenerateSongError
            ? error.message
            : "Something went wrong. Please try again.";
        setState((prev) => ({ ...prev, status: "FAILED", errorMessage: message }));
      }
    }

    start();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [router]);

  return state;
}
