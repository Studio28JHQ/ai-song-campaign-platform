import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LyricsContent } from "@/features/lyrics/components/LyricsContent";

describe("LyricsContent", () => {
  it("shows the first line as the title for a pre-v1.3 lyrics version (no section labels)", () => {
    render(<LyricsContent content={"Sofía's Lullaby\nVerse line one\nVerse line two"} />);

    expect(screen.getByRole("heading", { name: "Sofía's Lullaby" })).toBeInTheDocument();
    expect(screen.getByText(/verse line one/i)).toBeInTheDocument();
  });

  it("falls back to a generic title (Sprint v1.3 — AI Songwriting Quality) instead of showing '[Intro]' as the title", () => {
    render(
      <LyricsContent content={"[Intro]\nLa la la\n\n[Verse 1]\nSofía llegó con luz de sol"} />,
    );

    expect(screen.getByRole("heading", { name: "Tu canción" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "[Intro]" })).not.toBeInTheDocument();
  });

  it("keeps the [Intro] section label inside the rendered body when the first line is a section label", () => {
    render(
      <LyricsContent content={"[Intro]\nLa la la\n\n[Verse 1]\nSofía llegó con luz de sol"} />,
    );

    expect(screen.getByText(/\[Intro\]/)).toBeInTheDocument();
    expect(screen.getByText(/\[Verse 1\]/)).toBeInTheDocument();
    expect(screen.getByText(/la la la/i)).toBeInTheDocument();
  });

  it("falls back to the generic title for empty content", () => {
    render(<LyricsContent content="" />);
    expect(screen.getByRole("heading", { name: "Tu canción" })).toBeInTheDocument();
  });
});
