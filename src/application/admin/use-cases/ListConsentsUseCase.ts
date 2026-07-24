import type { AdminConsentGate } from "../contracts/AdminConsentGate";
import type { ListConsentsResponse } from "../dto/ListConsentsResponse";

/** Fixed, non-configurable — the admin "Consentimientos" screen always shows exactly the latest 20 records (no pagination/search requested for this screen). */
export const LATEST_CONSENTS_LIMIT = 20;

/** Loads the most recent Consent records for the admin "Consentimientos" screen. Pure read, no mutation. */
export class ListConsentsUseCase {
  constructor(private readonly consentGate: AdminConsentGate) {}

  async execute(): Promise<ListConsentsResponse> {
    const items = await this.consentGate.listLatest(LATEST_CONSENTS_LIMIT);
    return { items };
  }
}
