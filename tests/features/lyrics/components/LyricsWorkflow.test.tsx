import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LyricsWorkflow } from "@/features/lyrics/components/LyricsWorkflow";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const turnstileResetMock = vi.fn();
// A stable object reference matters here: `LyricsWorkflow` depends on
// `router` inside a `useEffect`, and real Next.js returns a memoized
// router — a fresh object per call would make the effect re-run every
// render (state update -> re-render -> new router -> effect -> ...).
const routerMock = { push: pushMock, replace: replaceMock };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

// The real widget loads Cloudflare's script and calls a real network
// endpoint — irrelevant to what these tests verify (workflow wiring),
// and unavailable in jsdom. It auto-verifies on mount so existing
// happy-path tests don't need to interact with it. `reset` is exposed via
// the same imperative-handle contract the real widget has, so
// `LyricsGenerationForm`'s token-reuse fix (calling it after a failed
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

const DEFAULT_PROPS = {
  maxAttempts: 5,
  supportEmail: "support@example.com",
  turnstileSiteKey: "test-site-key",
};

function renderWorkflow(props: Partial<typeof DEFAULT_PROPS> = {}) {
  return render(<LyricsWorkflow {...DEFAULT_PROPS} {...props} />);
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    babyName: "Baby Doe",
    remainingAttempts: 5,
    leadStatus: "GENERATING",
    approvedLyrics: null,
    song: null,
    ...overrides,
  };
}

/**
 * `LyricsWorkflow` now reconstructs its session from `GET
 * /api/leads/session` (the backend authority, see GATE 6.6) rather than
 * sessionStorage, and no longer sends a Lead id anywhere — so the fetch
 * mock must dispatch by URL, and every test supplies the session
 * response explicitly instead of seeding client-side storage.
 */
function routedFetch(options: {
  session: unknown | null;
  generateResponses?: unknown[];
  approveResponse?: unknown;
}) {
  const generateQueue = [...(options.generateResponses ?? [])];

  return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>>((input) => {
    const url = String(input);

    if (url === "/api/leads/session") {
      return Promise.resolve(
        options.session === null
          ? jsonResponse({ error: "no_session" }, false, 401)
          : jsonResponse(options.session),
      );
    }

    if (url === "/api/lyrics/generate") {
      return Promise.resolve(jsonResponse(generateQueue.shift() ?? {}));
    }

    if (url === "/api/lyrics/approve") {
      return Promise.resolve(jsonResponse(options.approveResponse ?? {}));
    }

    return Promise.resolve(jsonResponse({}));
  });
}

function install(mock: ReturnType<typeof routedFetch>): void {
  global.fetch = mock as unknown as typeof fetch;
}

describe("LyricsWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to / when there is no active session", async () => {
    install(routedFetch({ session: null }));
    renderWorkflow();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/"));
  });

  it("shows the generation form with baby name and remaining attempts", async () => {
    install(routedFetch({ session: baseSession() }));
    renderWorkflow();

    expect(await screen.findByText("Baby Doe")).toBeInTheDocument();
    expect(screen.getByText("Intentos restantes: 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear la letra/i })).toBeInTheDocument();
  });

  it("generates lyrics successfully and shows the review panel, never sending a Lead id", async () => {
    const user = userEvent.setup();
    const fetchMock = routedFetch({
      session: baseSession(),
      generateResponses: [
        {
          lyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1, approved: true },
          approved: true,
          reason: null,
          remainingAttempts: 5,
          leadStatus: "GENERATING",
        },
      ],
    });
    install(fetchMock);

    renderWorkflow();
    await user.type(await screen.findByLabelText(/tu mensaje/i), "A gentle bedtime song.");
    await user.click(screen.getByRole("button", { name: /crear la letra/i }));

    expect(await screen.findByText("Title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear canción/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /otra versión/i })).toBeInTheDocument();

    const generateCall = fetchMock.mock.calls.find(([url]) => url === "/api/lyrics/generate");
    const requestBody = JSON.parse((generateCall?.[1] as RequestInit).body as string);
    expect(requestBody).not.toHaveProperty("leadId");
    // Sprint v1.1 — AI Musical Direction: "Voz femenina" is the form's default.
    expect(requestBody.voice).toBe("FEMALE");
  });

  it("sends the selected MALE voice when 'Voz masculina' is chosen (Sprint v1.1 — AI Musical Direction)", async () => {
    const user = userEvent.setup();
    const fetchMock = routedFetch({
      session: baseSession(),
      generateResponses: [
        {
          lyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1, approved: true },
          approved: true,
          reason: null,
          remainingAttempts: 5,
          leadStatus: "GENERATING",
        },
      ],
    });
    install(fetchMock);

    renderWorkflow();
    await user.type(await screen.findByLabelText(/tu mensaje/i), "A gentle bedtime song.");
    await user.click(screen.getByLabelText("Voz masculina"));
    await user.click(screen.getByRole("button", { name: /crear la letra/i }));

    await screen.findByText("Title");

    const generateCall = fetchMock.mock.calls.find(([url]) => url === "/api/lyrics/generate");
    const requestBody = JSON.parse((generateCall?.[1] as RequestInit).body as string);
    expect(requestBody.voice).toBe("MALE");
  });

  it("shows Attempt X / MAX using the configured maximum, not a hardcoded value", async () => {
    const user = userEvent.setup();
    install(
      routedFetch({
        session: baseSession(),
        generateResponses: [
          {
            lyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1, approved: true },
            approved: true,
            reason: null,
            remainingAttempts: 5,
            leadStatus: "GENERATING",
          },
        ],
      }),
    );

    renderWorkflow({ maxAttempts: 7 });
    await user.type(await screen.findByLabelText(/tu mensaje/i), "A gentle bedtime song.");
    await user.click(screen.getByRole("button", { name: /crear la letra/i }));

    expect(await screen.findByText("Intento 1 / 7")).toBeInTheDocument();
  });

  it("shows a rejection message and stays on the generation form", async () => {
    const user = userEvent.setup();
    install(
      routedFetch({
        session: baseSession(),
        generateResponses: [
          {
            lyrics: null,
            approved: false,
            reason: "Contains offensive language.",
            remainingAttempts: 4,
            leadStatus: "GENERATING",
          },
        ],
      }),
    );

    renderWorkflow();
    await user.type(await screen.findByLabelText(/tu mensaje/i), "bad content");
    await user.click(screen.getByRole("button", { name: /crear la letra/i }));

    expect(await screen.findByText("Contains offensive language.")).toBeInTheDocument();
    expect(screen.getByText("Intentos restantes: 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear la letra/i })).toBeInTheDocument();
  });

  it("resets the Turnstile widget after a failed submission and blocks retrying without a fresh token", async () => {
    const user = userEvent.setup();
    // A real (non-ok) failure, unlike `generateResponses` above (always a
    // 200 — moderation rejections are a normal, expected outcome; see
    // `routedFetch`'s `jsonResponse` default). Turnstile rejection is a
    // genuine `403`, so this test builds its own fetch mock instead.
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/leads/session") return Promise.resolve(jsonResponse(baseSession()));
      if (url === "/api/lyrics/generate") {
        return Promise.resolve(
          jsonResponse(
            { error: "human_verification_failed", message: "irrelevant — never rendered" },
            false,
            403,
          ),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWorkflow();
    await user.type(await screen.findByLabelText(/tu mensaje/i), "A gentle bedtime song.");
    await user.click(screen.getByRole("button", { name: /crear la letra/i }));

    // The generate service maps a non-ok response to its Spanish,
    // code-keyed message — never the server's raw `message` field.
    expect(
      await screen.findByText("No pudimos verificar que no eres un robot. Inténtalo de nuevo."),
    ).toBeInTheDocument();
    expect(turnstileResetMock).toHaveBeenCalledTimes(1);

    const generateCallsBefore = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "/api/lyrics/generate",
    ).length;

    await user.click(screen.getByRole("button", { name: /crear la letra/i }));

    expect(await screen.findByText("Completa la verificación de seguridad.")).toBeInTheDocument();
    const generateCallsAfter = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "/api/lyrics/generate",
    ).length;
    // No second network call — a fresh token is required before resubmitting.
    expect(generateCallsAfter).toBe(generateCallsBefore);
  });

  it("consumes an attempt and refreshes the UI on Generate Again", async () => {
    const user = userEvent.setup();
    install(
      routedFetch({
        session: baseSession(),
        generateResponses: [
          {
            lyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1, approved: true },
            approved: true,
            reason: null,
            remainingAttempts: 5,
            leadStatus: "GENERATING",
          },
          {
            lyrics: {
              id: "lyrics-2",
              content: "New Title\nVerse 1\n...",
              version: 2,
              approved: true,
            },
            approved: true,
            reason: null,
            remainingAttempts: 4,
            leadStatus: "GENERATING",
          },
        ],
      }),
    );

    renderWorkflow();
    await user.type(await screen.findByLabelText(/tu mensaje/i), "A gentle bedtime song.");
    await user.click(screen.getByRole("button", { name: /crear la letra/i }));

    await screen.findByText("Title");
    await user.click(screen.getByRole("button", { name: /otra versión/i }));

    expect(await screen.findByText("New Title")).toBeInTheDocument();
    expect(screen.getByText("Intentos restantes: 4")).toBeInTheDocument();
  });

  it("approves the lyrics and navigates to /song, without writing anything to client storage", async () => {
    const user = userEvent.setup();
    const fetchMock = routedFetch({
      session: baseSession(),
      generateResponses: [
        {
          lyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1, approved: true },
          approved: true,
          reason: null,
          remainingAttempts: 5,
          leadStatus: "GENERATING",
        },
      ],
      approveResponse: {
        lyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1, approved: true },
      },
    });
    install(fetchMock);

    renderWorkflow();
    await user.type(await screen.findByLabelText(/tu mensaje/i), "A gentle bedtime song.");
    await user.click(screen.getByRole("button", { name: /crear la letra/i }));

    await screen.findByText("Title");
    await user.click(screen.getByRole("button", { name: /crear canción/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/song"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lyrics/approve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(window.sessionStorage.length).toBe(0);
  });

  it("disables Generate Lyrics once remaining attempts reach zero", async () => {
    install(routedFetch({ session: baseSession({ remainingAttempts: 0 }) }));
    renderWorkflow();

    expect(await screen.findByRole("button", { name: /crear la letra/i })).toBeDisabled();
  });

  describe("once a Lyrics version has been approved (reconstructed from the backend)", () => {
    it("does not show the generation form, mood selector, message textarea, or remaining attempts", async () => {
      install(
        routedFetch({
          session: baseSession({
            approvedLyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1 },
            song: { songId: "song-1", status: "QUEUED" },
          }),
        }),
      );

      renderWorkflow();

      await screen.findByText("Title");
      expect(screen.queryByRole("button", { name: /crear la letra/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/elige el estilo/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/tu mensaje/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/intentos restantes/i)).not.toBeInTheDocument();
    });

    it("hides the Generate Again and Approve Lyrics buttons", async () => {
      install(
        routedFetch({
          session: baseSession({
            approvedLyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1 },
            song: { songId: "song-1", status: "QUEUED" },
          }),
        }),
      );

      renderWorkflow();

      await screen.findByText("Title");
      expect(screen.queryByRole("button", { name: /otra versión/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /crear canción/i })).not.toBeInTheDocument();
    });

    it("renders the approved lyrics read-only, with no editable control", async () => {
      install(
        routedFetch({
          session: baseSession({
            approvedLyrics: { id: "lyrics-1", content: "Title\nLine one\nLine two", version: 2 },
            song: { songId: "song-1", status: "GENERATING" },
          }),
        }),
      );

      renderWorkflow();

      expect(await screen.findByText("Title")).toBeInTheDocument();
      expect(screen.getByText(/line one/i)).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("displays Attempt X / MAX using the approved version and the configured maximum", async () => {
      install(
        routedFetch({
          session: baseSession({
            approvedLyrics: { id: "lyrics-1", content: "Title\n...", version: 3 },
            song: { songId: "song-1", status: "QUEUED" },
          }),
        }),
      );

      renderWorkflow({ maxAttempts: 5 });

      expect(await screen.findByText("Intento 3 / 5")).toBeInTheDocument();
    });

    it("shows the current song status directly from the backend session response, not invented state", async () => {
      install(
        routedFetch({
          session: baseSession({
            approvedLyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1 },
            song: { songId: "song-1", status: "GENERATING" },
          }),
        }),
      );

      renderWorkflow();

      expect(await screen.findByText("Creando tu canción")).toBeInTheDocument();
    });

    it("on failed song generation, shows only the failure message and support email from configuration — never reopening lyrics generation", async () => {
      install(
        routedFetch({
          session: baseSession({
            approvedLyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1 },
            song: { songId: "song-1", status: "FAILED" },
          }),
        }),
      );

      renderWorkflow({ supportEmail: "help@campaign.example" });

      expect(await screen.findByText("No pudimos crear tu canción")).toBeInTheDocument();
      expect(screen.getByText("help@campaign.example")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /crear la letra/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /otra versión/i })).not.toBeInTheDocument();
    });

    it("survives a browser storage wipe — the lock comes from the backend, not sessionStorage", async () => {
      install(
        routedFetch({
          session: baseSession({
            approvedLyrics: { id: "lyrics-1", content: "Title\nVerse 1\n...", version: 1 },
            song: { songId: "song-1", status: "QUEUED" },
          }),
        }),
      );
      window.sessionStorage.clear();

      renderWorkflow();

      expect(await screen.findByText("Title")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /crear la letra/i })).not.toBeInTheDocument();
    });
  });
});
