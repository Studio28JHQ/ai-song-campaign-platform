import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/features/admin/components/LoginForm";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function mockFetchOnce(response: { ok: boolean; status?: number; body: unknown }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 401),
    json: async () => response.body,
  }) as unknown as typeof fetch;
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs in successfully and navigates to /admin/dashboard", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: true,
      body: { admin: { id: "admin-1", email: "admin@example.com", name: "Jane Admin" } },
    });

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin/dashboard"));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/login",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows a generic error banner for invalid credentials, without navigating", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: false,
      status: 401,
      body: { error: "invalid_credentials", message: "Invalid email or password." },
    });

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows validation errors for empty fields and never calls the API", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn();

    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("submits rememberMe when the checkbox is checked", async () => {
    const user = userEvent.setup();
    mockFetchOnce({
      ok: true,
      body: { admin: { id: "admin-1", email: "admin@example.com", name: "Jane Admin" } },
    });

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByLabelText(/remember me/i));
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.rememberMe).toBe(true);
  });
});
