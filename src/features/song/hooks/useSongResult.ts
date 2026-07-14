"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getLeadSession,
  type LeadSessionSongStatus,
} from "@/features/lead/services/getLeadSession";

export interface SongResultState {
  babyName: string | null;
  status: LeadSessionSongStatus | null;
  audioUrl: string | null;
  duration: number | null;
  loading: boolean;
}

const INITIAL_STATE: SongResultState = {
  babyName: null,
  status: null,
  audioUrl: null,
  duration: null,
  loading: true,
};

/**
 * Drives the Song Result page: reconstructs the current Song (if any)
 * from the backend (see `GET /api/leads/session` — GATE 6.6) with a
 * single fetch on mount. Lyrics approval now queues the Song job and
 * schedules its generation server-side (see PROJECT_MANIFEST.md —
 * Architecture exception, Sprint 7.5), so this page never triggers
 * generation itself and never polls — it is a purely informational
 * waiting page. The parent is notified by email once the song is
 * `COMPLETED`. The Lead is identified only by the session cookie; no
 * Lead id is ever read from or sent by this hook.
 */
export function useSongResult(): SongResultState {
  const router = useRouter();
  const [state, setState] = useState<SongResultState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const session = await getLeadSession();
      if (cancelled) return;

      if (!session) {
        router.replace("/");
        return;
      }

      setState({
        babyName: session.babyName,
        status: session.song?.status ?? "QUEUED",
        audioUrl: session.song?.audioUrl ?? null,
        duration: session.song?.duration ?? null,
        loading: false,
      });
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return state;
}
