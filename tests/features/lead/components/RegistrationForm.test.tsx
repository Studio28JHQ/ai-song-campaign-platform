import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationForm } from "@/features/lead/components/RegistrationForm";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// The real widget loads Cloudflare's script and calls a real network
// endpoint — irrelevant to what these tests verify (form wiring), and
// unavailable in jsdom. It auto-verifies on mount so existing
// happy-path tests don't need to interact with it.
vi.mock("@/components/security/TurnstileWidget", () => ({
  TurnstileWidget: ({ onVerify }: { onVerify: (token: string) => void }) => {
    useEffect(() => {
      onVerify("test-turnstile-token");
    }, [onVerify]);
    return null;
  },
}));

function renderForm() {
  return render(<RegistrationForm turnstileSiteKey="test-site-key" />);
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Tu nombre"), "Jane Doe");
  await user.type(screen.getByLabelText("Nombre del bebé"), "Baby Doe");
  await user.type(screen.getByLabelText("Correo electrónico"), "jane@example.com");
}

function mockFetchOnce(response: { ok: boolean; status?: number; body: unknown }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 201 : 400),
    json: async () => response.body,
  }) as unknown as typeof fetch;
}

describe("RegistrationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("submits successfully and navigates to /generate — the server identifies the lead via a session cookie, never a client-stored id", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: true,
      body: { remainingAttempts: 5, status: "REGISTERED" },
    });

    renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /registr/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/generate"));
    expect(window.sessionStorage.length).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/leads",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows validation errors for empty required fields and never calls the API", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn();

    renderForm();
    await user.click(screen.getByRole("button", { name: /registr/i }));

    expect(await screen.findByText("Tu nombre es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("Nombre del bebé es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("Correo electrónico es obligatorio.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows a validation error for a malformed email", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn();

    renderForm();
    await user.type(screen.getByLabelText("Tu nombre"), "Jane Doe");
    await user.type(screen.getByLabelText("Nombre del bebé"), "Baby Doe");
    await user.type(screen.getByLabelText("Correo electrónico"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /registr/i }));

    expect(await screen.findByText("Ingresa un correo electrónico válido.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows a field-level error when the email is already registered", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: false,
      status: 409,
      // The server's own `message` is deliberately ignored in favor of a
      // local, Spanish, code-keyed message (Sprint UI-1) — see
      // `registerLead.ts`. This value is irrelevant to the assertion below.
      body: { error: "email_already_registered", message: "irrelevant — never rendered" },
    });

    renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /registr/i }));

    expect(
      await screen.findByText("Este correo ya fue utilizado para registrarse."),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows a generic banner for an unexpected server error", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: false,
      status: 500,
      body: { error: "internal_error", message: "irrelevant — never rendered" },
    });

    renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /registr/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Algo salió mal. Inténtalo de nuevo.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("disables the submit button while the request is in flight", async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: unknown) => void = () => {};
    global.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /registr/i }));

    expect(await screen.findByRole("button", { name: /registrando/i })).toBeDisabled();

    resolveFetch({
      ok: true,
      json: async () => ({ remainingAttempts: 5, status: "REGISTERED" }),
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });
});
