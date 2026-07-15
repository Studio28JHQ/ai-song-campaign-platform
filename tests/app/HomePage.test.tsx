import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "../../app/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("HomePage (Landing Page)", () => {
  it("renders every required section with exactly one h1 and an h2 per section", () => {
    render(<HomePage />);

    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/canción/i);

    expect(
      screen.getByRole("heading", { level: 2, name: /qué es esta campaña/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /cómo funciona/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /crea la canción de tu bebé/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /preguntas frecuentes/i }),
    ).toBeInTheDocument();
  });

  it("displays the six-step campaign flow in the documented order", () => {
    render(<HomePage />);

    const steps = [
      "Regístrate",
      "Cuéntanos sobre tu bebé",
      "La IA escribe la letra",
      "Tú apruebas la letra",
      "La IA crea la canción",
      "La recibes por correo",
    ];

    const stepHeadings = screen.getAllByRole("heading", { level: 3 });
    expect(stepHeadings.map((heading) => heading.textContent)).toEqual(steps);
  });

  it("includes the legal disclaimer and a footer landmark", () => {
    render(<HomePage />);

    expect(screen.getByText(/campaña promocional por tiempo limitado/i)).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByText(/todos los derechos reservados/i)).toBeInTheDocument();
  });

  it("embeds the existing registration form directly in the Hero, as the single entry point", () => {
    render(<HomePage />);

    // Exactly one submit control for registration anywhere on the page.
    expect(screen.getAllByRole("button", { name: /crear la canción de mi bebé/i })).toHaveLength(1);
    expect(screen.getByLabelText("Tu nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre del bebé")).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
  });

  it("uses responsive grid utility classes for the how-it-works layout", () => {
    render(<HomePage />);

    const heading = screen.getByRole("heading", { level: 2, name: /cómo funciona/i });
    const list = heading.parentElement?.querySelector("ol");

    expect(list?.className).toContain("grid-cols-1");
    expect(list?.className).toContain("sm:grid-cols-2");
    expect(list?.className).toContain("lg:grid-cols-3");
  });

  it("accessibility smoke: main/footer/banner landmarks, single h1, and every image has alt text", () => {
    render(<HomePage />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    document.querySelectorAll("img").forEach((img) => {
      expect(img).toHaveAttribute("alt");
    });
  });

  it("FAQ items are native, keyboard-accessible disclosure elements", () => {
    render(<HomePage />);

    const summary = screen.getByText(/cuánto cuesta/i);
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.closest("details")).not.toBeNull();
  });

  it("decorative illustrations are hidden from assistive technology", () => {
    render(<HomePage />);

    document.querySelectorAll('img[alt=""]').forEach((img) => {
      expect(img).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("the navigation bar renders only the campaign logo — no technical navigation links", () => {
    render(<HomePage />);

    const nav = screen.getByRole("banner");
    expect(nav.querySelectorAll("a, button")).toHaveLength(0);
    expect(within(nav).getByRole("img", { name: "Bassa" })).toBeInTheDocument();
  });
});
