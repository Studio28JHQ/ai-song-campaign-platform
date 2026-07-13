export type AppErrorCategory =
  "validation" | "external_api" | "database" | "business_rule" | "infrastructure";

export interface AppErrorOptions {
  code: string;
  category: AppErrorCategory;
  cause?: unknown;
  context?: Record<string, unknown>;
}

/**
 * Base class for every application-level error. Feature-specific errors
 * should extend one of the category subclasses in `./index`, not this
 * class directly, so error handling can dispatch on `category`.
 */
export class AppError extends Error {
  readonly code: string;
  readonly category: AppErrorCategory;
  readonly context?: Record<string, unknown>;

  constructor(message: string, options: AppErrorOptions) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = options.code;
    this.category = options.category;
    this.context = options.context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
