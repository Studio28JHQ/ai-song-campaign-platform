import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "../../app/not-found";

describe("NotFound (app/not-found.tsx)", () => {
  it("renders a heading and a link back home", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: /página no encontrada/i }),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /volver al inicio/i });
    expect(link).toHaveAttribute("href", "/");
  });
});
