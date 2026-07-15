import { AppError, type AppErrorOptions } from "./AppError";

type CategoryErrorOptions = Omit<AppErrorOptions, "category">;

/** Invalid input, failed schema validation. */
export class ValidationError extends AppError {
  constructor(message: string, options: CategoryErrorOptions) {
    super(message, { ...options, category: "validation" });
    this.name = "ValidationError";
  }
}

/** A call to an external provider (Claude, Mureka, Resend, ...) failed. */
export class ExternalApiError extends AppError {
  constructor(message: string, options: CategoryErrorOptions) {
    super(message, { ...options, category: "external_api" });
    this.name = "ExternalApiError";
  }
}

/** A persistence operation failed or returned an unexpected result. */
export class DatabaseError extends AppError {
  constructor(message: string, options: CategoryErrorOptions) {
    super(message, { ...options, category: "database" });
    this.name = "DatabaseError";
  }
}

/** A domain/business rule was violated (see docs/Product/Business_Rules.md). */
export class BusinessRuleError extends AppError {
  constructor(message: string, options: CategoryErrorOptions) {
    super(message, { ...options, category: "business_rule" });
    this.name = "BusinessRuleError";
  }
}

/** A non-business, non-external infrastructure failure. */
export class InfrastructureError extends AppError {
  constructor(message: string, options: CategoryErrorOptions) {
    super(message, { ...options, category: "infrastructure" });
    this.name = "InfrastructureError";
  }
}

export { AppError };
export type { AppErrorCategory, AppErrorOptions } from "./AppError";
