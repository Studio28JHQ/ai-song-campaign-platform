/**
 * Boundary-facing input for `CreateLeadUseCase`. Plain data only — no
 * validation library types here; validation happens in the domain layer
 * (value objects) when the use case builds the `Lead` entity.
 */
export interface CreateLeadRequest {
  campaignId: string;
  parentName: string;
  babyName: string;
  babyAge?: number;
  city?: string;
  email: string;
  phone?: string;
}
