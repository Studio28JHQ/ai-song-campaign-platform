import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GlobalErrorBoundary from "../../app/error";

describe("GlobalErrorBoundary (app/error.tsx)", () => {
  it("renders a generic message without leaking the raw error message", () => {
    const error = Object.assign(new Error("raw provider secret detail"), { digest: "abc123" });
    render(<GlobalErrorBoundary error={error} reset={vi.fn()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: /something went wrong/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/raw provider secret detail/i)).not.toBeInTheDocument();
  });

  it("calls reset when the retry button is clicked", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<GlobalErrorBoundary error={new Error("boom")} reset={reset} />);

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledOnce();
  });
});
