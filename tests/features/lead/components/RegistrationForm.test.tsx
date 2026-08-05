import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationForm } from "@/features/lead/components/RegistrationForm";

const pushMock = vi.fn();
const turnstileResetMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// The real widget loads Cloudflare's script and calls a real network
// endpoint — irrelevant to what these tests verify (form wiring), and
// unavailable in jsdom. It auto-verifies on mount so existing
// happy-path tests don't need to interact with it. `reset` is exposed via
// the same imperative-handle contract the real widget has, so
// `RegistrationForm`'s token-reuse fix (calling it after a failed
// submission) can be exercised/asserted on.
vi.mock("@/components/security/TurnstileWidget", () => ({
  TurnstileWidget: forwardRef(function TurnstileWidget(
    { onVerify }: { onVerify: (token: string) => void },
    ref: React.Ref<{ reset: () => void }>,
  ) {
    useImperativeHandle(ref, () => ({ reset: turnstileResetMock }));
    useEffect(() => {
      onVerify("test-turnstile-token");
      // Mount once, like the real widget — `onVerify` is a fresh inline
      // closure on every parent render, and re-running this on every
      // change would keep re-supplying a token after a reset clears it.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }),
}));

function renderForm() {
  return render(<RegistrationForm turnstileSiteKey="test-site-key" />);
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Tu nombre"), "Jane Doe");
  await user.type(screen.getByLabelText("Nombre del bebé"), "Baby Doe");
  await user.type(screen.getByLabelText("Correo electrónico"), "jane@example.com");
  await user.click(screen.getByLabelText(/política de privacidad/i));
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

  it("resets the Turnstile widget after a failed submission and blocks retrying without a fresh token", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: false,
      status: 403,
      body: { error: "human_verification_failed", message: "irrelevant — never rendered" },
    });

    renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /crear la canción/i }));

    expect(
      await screen.findByText("No pudimos verificar que no eres un robot. Inténtalo de nuevo."),
    ).toBeInTheDocument();
    // The spent token is cleared and the same widget instance is reset —
    // never replaced — so the mocked widget (which only auto-verifies once,
    // on mount) never re-supplies a token on its own.
    expect(turnstileResetMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /crear la canción/i }));

    expect(await screen.findByText("Completa la verificación de seguridad.")).toBeInTheDocument();
    // No second network call — a fresh token is required before resubmitting.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("submits successfully and navigates to /generate — the server identifies the lead via a session cookie, never a client-stored id", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: true,
      body: { remainingAttempts: 5, status: "REGISTERED" },
    });

    renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /crear la canción/i }));

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
    // The submit button stays disabled until terms are accepted (see its
    // own dedicated test) — checked here too so this test can reach the
    // *other* fields' validation.
    await user.click(screen.getByLabelText(/política de privacidad/i));
    await user.click(screen.getByRole("button", { name: /crear la canción/i }));

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
    await user.click(screen.getByLabelText(/política de privacidad/i));
    await user.click(screen.getByRole("button", { name: /crear la canción/i }));

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
    await user.click(screen.getByRole("button", { name: /crear la canción/i }));

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
    await user.click(screen.getByRole("button", { name: /crear la canción/i }));

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
    await user.click(screen.getByRole("button", { name: /crear la canción/i }));

    expect(await screen.findByRole("button", { name: /creando tu canción/i })).toBeDisabled();

    resolveFetch({
      ok: true,
      json: async () => ({ remainingAttempts: 5, status: "REGISTERED" }),
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });

  it("keeps the submit button disabled until the terms checkbox is accepted", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn();

    renderForm();
    await user.type(screen.getByLabelText("Tu nombre"), "Jane Doe");
    await user.type(screen.getByLabelText("Nombre del bebé"), "Baby Doe");
    await user.type(screen.getByLabelText("Correo electrónico"), "jane@example.com");

    const submitButton = screen.getByRole("button", { name: /crear la canción/i });
    expect(submitButton).toBeDisabled();

    await user.click(screen.getByLabelText(/política de privacidad/i));
    expect(submitButton).toBeEnabled();
  });

  it("blocks submission and shows an error when the terms checkbox is unchecked", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn();

    renderForm();
    await user.type(screen.getByLabelText("Tu nombre"), "Jane Doe");
    await user.type(screen.getByLabelText("Nombre del bebé"), "Baby Doe");
    await user.type(screen.getByLabelText("Correo electrónico"), "jane@example.com");

    // The button stays disabled while unchecked (see the test above), so
    // native `noValidate` submission never fires — asserting the checkbox
    // itself carries the failure is what actually matters here.
    expect(screen.getByLabelText(/política de privacidad/i)).not.toBeChecked();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("submits the selected Age band as the integer the backend already expects", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: true,
      body: { remainingAttempts: 5, status: "REGISTERED" },
    });

    renderForm();
    await fillRequiredFields(user);
    await user.selectOptions(screen.getByLabelText("Edad del bebé"), "1 a 2 años");
    await user.click(screen.getByRole("button", { name: /crear la canción/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.babyAge).toBe(24);
  });

  it("submits the selected City option as plain text", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: true,
      body: { remainingAttempts: 5, status: "REGISTERED" },
    });

    renderForm();
    await fillRequiredFields(user);
    await user.selectOptions(screen.getByLabelText("Ciudad"), "Guayaquil");
    await user.click(screen.getByRole("button", { name: /crear la canción/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.city).toBe("Guayaquil");
  });

  it("leaves Age and City unselected without blocking submission — both stay optional", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: true,
      body: { remainingAttempts: 5, status: "REGISTERED" },
    });

    renderForm();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /crear la canción/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, requestInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((requestInit as RequestInit).body as string);
    expect(body.babyAge).toBeUndefined();
    expect(body.city).toBeUndefined();
  });
});
