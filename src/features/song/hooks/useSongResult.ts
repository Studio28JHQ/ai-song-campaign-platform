"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getLeadSession } from "@/features/lead/services/getLeadSession";
import { GenerateSongError, generateSong } from "../services/generateSong";
import { getSongStatus, type SongStatusValue } from "../services/getSongStatus";

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
 * Drives the Song Result page end to end: reconstructs the current Song
 * (if any) from the backend (see `GET /api/leads/session` — GATE 6.6)
 * rather than client-side storage, starts generation only when no Song
 * exists yet, then polls `GET /api/song/{songId}` every 5 seconds until
 * the song reaches a terminal status (`COMPLETED` or `FAILED`), at which
 * point polling stops immediately. There is no WebSocket or
 * Server-Sent Events channel — polling is the whole mechanism (see
 * docs/Architecture/System_Architecture.md). The Lead is identified only
 * by the session cookie; no Lead id is ever read from or sent by this
 * hook.
 */
export function useSongResult(): SongResultState {
  const router = useRouter();
  const [state, setState] = useState<SongResultState>(INITIAL_STATE);

  useEffect(() => {
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

    async function poll(songId: string): Promise<SongStatusValue | undefined> {
      try {
        const result = await getSongStatus(songId);
        applyStatus(result.status, result.audioUrl, result.duration);
        return result.status;
      } catch {
        // A transient network/error response while polling is not the
        // same as the song failing — keep polling on the next tick
        // rather than surfacing a false FAILED state.
        return undefined;
      }
    }

    async function start(): Promise<void> {
      const session = await getLeadSession();
      if (cancelled) return;

      if (!session) {
        router.replace("/");
        return;
      }

      setState((prev) => ({ ...prev, babyName: session.babyName }));

      if (session.song) {
        // The session snapshot can be a moment stale by the time this
        // renders — poll immediately for a fresh read rather than
        // trusting it, same as the very first poll after starting a new
        // generation below, and decide whether to keep polling from that
        // fresh result, not the snapshot.
        const songId = session.song.songId;
        const freshStatus = await poll(songId);

        // Keep polling unless the fresh read confirmed a terminal status —
        // a transient failure (`freshStatus` undefined) must not stop
        // polling from ever starting.
        if (!cancelled && (!freshStatus || !TERMINAL_STATUSES.has(freshStatus))) {
          intervalId = setInterval(() => poll(songId), POLL_INTERVAL_MS);
        }
        return;
      }

      try {
        const result = await generateSong();
        if (cancelled) return;

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
