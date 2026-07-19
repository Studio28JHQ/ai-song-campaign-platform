import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LyricsGenerationWaitingMessages } from "@/features/lyrics/components/LyricsGenerationWaitingMessages";

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("LyricsGenerationWaitingMessages", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at a fixed, deterministic first message (never Math.random()/Date.now()) so no hydration mismatch is possible", () => {
    render(<LyricsGenerationWaitingMessages babyName="Mateo" />);

    expect(
      screen.getByText(
        "✨ Estamos conociendo un poquito mejor a Mateo para que su canción sea única.",
      ),
    ).toBeInTheDocument();
  });

  it("interpolates the baby's name into the message", () => {
    render(<LyricsGenerationWaitingMessages babyName="Sofía" />);

    expect(screen.getByText(/Sofía/)).toBeInTheDocument();
  });

  it("is announced to assistive technology via role=status/aria-live=polite", () => {
    render(<LyricsGenerationWaitingMessages babyName="Mateo" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("rotates to the next message after ~6s, fading out then back in, with no layout jump (fixed min-height)", async () => {
    render(<LyricsGenerationWaitingMessages babyName="Mateo" />);
    const status = screen.getByRole("status");

    expect(status).toHaveStyle({ opacity: "1" });
    expect(status.className).toContain("min-h-12");

    // Just before the 6s interval — still the first message, still visible.
    await advance(5999);
    expect(status).toHaveTextContent("Estamos conociendo un poquito mejor a Mateo");

    // At the interval mark, it starts fading out (opacity 0) before swapping text.
    await advance(1);
    expect(status).toHaveStyle({ opacity: "0" });

    // After the ~300ms fade completes, the next message is shown, faded back in.
    await advance(300);
    expect(status).toHaveStyle({ opacity: "1" });
    expect(status).toHaveTextContent("Buscando las palabras perfectas para contar su historia.");
  });

  it("loops back to the first message after cycling through all ten", async () => {
    render(<LyricsGenerationWaitingMessages babyName="Mateo" />);
    const status = screen.getByRole("status");

    // Each rotation completes 6000ms (interval) + 300ms (fade) after the
    // previous one — 10 full rotations to land back on message 1.
    await advance(10 * 6300);

    expect(status).toHaveTextContent("Estamos conociendo un poquito mejor a Mateo");
  });

  it("stops rotating once unmounted (no leaked timers)", async () => {
    const { unmount } = render(<LyricsGenerationWaitingMessages babyName="Mateo" />);
    unmount();

    // Would throw/warn on a React state update after unmount if the
    // interval/timeout weren't cleaned up.
    await advance(20_000);
  });
});
