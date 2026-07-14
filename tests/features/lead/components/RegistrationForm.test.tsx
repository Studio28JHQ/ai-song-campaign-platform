import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationForm } from "@/features/lead/components/RegistrationForm";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Parent name"), "Jane Doe");
  await user.type(screen.getByLabelText("Baby name"), "Baby Doe");
  await user.type(screen.getByLabelText("Email"), "jane@example.com");
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

    render(<RegistrationForm />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /register/i }));

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

    render(<RegistrationForm />);
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(await screen.findByText("Parent's name is required.")).toBeInTheDocument();
    expect(screen.getByText("Baby's name is required.")).toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows a validation error for a malformed email", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn();

    render(<RegistrationForm />);
    await user.type(screen.getByLabelText("Parent name"), "Jane Doe");
    await user.type(screen.getByLabelText("Baby name"), "Baby Doe");
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows a field-level error when the email is already registered", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: false,
      status: 409,
      body: {
        error: "email_already_registered",
        message: "This email has already been used to register a lead.",
      },
    });

    render(<RegistrationForm />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(
      await screen.findByText("This email has already been used to register a lead."),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows a generic banner for an unexpected server error", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: false,
      status: 500,
      body: { error: "internal_error", message: "Something went wrong. Please try again." },
    });

    render(<RegistrationForm />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
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

    render(<RegistrationForm />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /register/i }));

    expect(await screen.findByRole("button", { name: /registering/i })).toBeDisabled();

    resolveFetch({
      ok: true,
      json: async () => ({ remainingAttempts: 5, status: "REGISTERED" }),
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });
});
