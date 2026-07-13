/**
 * Generic, cross-cutting types with no ties to a specific domain concept.
 * Domain-specific types belong in `src/domain/`, not here.
 */

/** Explicit success/failure result, for flows that model expected errors instead of throwing. */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;
