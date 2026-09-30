import type { SharePlatform } from "@/generated/prisma/client";

/**
 * Share Tracking — one family's share history, for the Lead Detail
 * screen.
 *
 * A read gate like the other admin gates: no aggregate, no behaviour,
 * just the rows a human needs in order to answer "did this family share
 * their song, when, and where?". Deliberately narrow — it returns no
 * ids, because the screen already knows whose family it is showing and
 * nothing on it links anywhere by share id.
 */
export interface AdminShareEventView {
  platform: SharePlatform;
  createdAt: Date;
}

export interface AdminShareEventGate {
  /**
   * A lead's share events, newest first. Scoped to that lead by the
   * query itself, never filtered afterwards, so no other family's
   * events can reach this screen.
   *
   * Unbounded on purpose: a family has one song and a handful of
   * shares, so there is nothing here to paginate — the same reasoning
   * `AdminLyricsAttemptGate` already applies.
   */
  findByLead(leadId: string): Promise<AdminShareEventView[]>;
}
