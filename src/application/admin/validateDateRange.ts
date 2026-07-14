import { ValidationError } from "@/shared/errors";

/** Shared by `SearchLeadsUseCase` and `ExportLeadsUseCase` so search and export always agree on what counts as a valid date range. */
export function validateDateRange(dateFrom?: Date, dateTo?: Date): void {
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ValidationError("dateFrom must not be after dateTo.", {
      code: "admin.invalid_date_range",
      context: { dateFrom, dateTo },
    });
  }
}
