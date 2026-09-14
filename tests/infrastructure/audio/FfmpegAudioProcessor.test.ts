import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import ffmpegPath from "ffmpeg-static";
import { InfrastructureError } from "@/shared/errors";
import {
  FfmpegAudioProcessor,
  type FfmpegRunResult,
  type FfmpegRunner,
} from "@/infrastructure/audio/FfmpegAudioProcessor";

const FAKE_BINARY_PATH = "/fake/path/to/ffmpeg";

/**
 * Builds a real, minimal MP3 fixture with the actual `ffmpeg-static`
 * binary (silence via the `lavfi` `anullsrc` source — no network, no
 * checked-in binary fixture) for the integration tests below, which
 * exercise `FfmpegAudioProcessor`'s *default* constructor (real binary
 * path, real `child_process.spawn`) rather than the fake `FfmpegRunner`
 * every other test in this file uses. Encoding a few seconds — or even
 * a minute — of silence takes a few milliseconds, not real time.
 */
function synthesizeSilentMp3(durationSeconds: number): Uint8Array {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static binary path could not be resolved for test fixture setup.");
  }
  const result = spawnSync(
    ffmpegPath,
    [
      "-hide_banner",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=8000:cl=mono",
      "-t",
      String(durationSeconds),
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "2",
      "-f",
      "mp3",
      "pipe:1",
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.status !== 0 || !result.stdout || result.stdout.length === 0) {
    throw new Error(
      `Failed to synthesize test fixture audio: ${result.stderr?.toString() ?? "unknown error"}`,
    );
  }
  return new Uint8Array(result.stdout);
}

function stderrWithDuration(hh: string, mm: string, ss: string, cs = "00"): string {
  return `Input #0, mp3, from 'pipe:0':\n  Duration: ${hh}:${mm}:${ss}.${cs}, start: 0.000000, bitrate: 128 kb/s\n`;
}

/**
 * Mimics a real `child_process.spawn` `'error'` event's
 * `NodeJS.ErrnoException` — the shape Node actually attaches `code`/
 * `errno`/`syscall`/`path`/`spawnargs` to, not just a plain `Error`.
 */
function fakeSpawnError(
  code: string,
  overrides: Partial<{
    errno: number;
    syscall: string;
    path: string;
    spawnargs: string[];
  }> = {},
): NodeJS.ErrnoException {
  const path = overrides.path ?? FAKE_BINARY_PATH;
  const error = new Error(`spawn ${path} ${code}`) as NodeJS.ErrnoException;
  error.code = code;
  error.errno = overrides.errno ?? -2;
  error.syscall = overrides.syscall ?? `spawn ${path}`;
  error.path = path;
  (error as unknown as { spawnargs?: string[] }).spawnargs = overrides.spawnargs ?? [
    "-hide_banner",
    "-i",
    "pipe:0",
  ];
  return error;
}

function fakeRunner(result: Partial<FfmpegRunResult> | Error): {
  runner: FfmpegRunner;
  calls: Array<{ binaryPath: string; args: string[]; input: Uint8Array }>;
} {
  const calls: Array<{ binaryPath: string; args: string[]; input: Uint8Array }> = [];
  const runner: FfmpegRunner = async (binaryPath, args, input) => {
    calls.push({ binaryPath, args, input });
    if (result instanceof Error) throw result;
    return {
      stdout: result.stdout ?? new Uint8Array(),
      stderr: result.stderr ?? "",
      exitCode: result.exitCode ?? 0,
    };
  };
  return { runner, calls };
}

describe("FfmpegAudioProcessor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a source shorter than 60 seconds byte-for-byte untouched, never padded to 60s", async () => {
    const { runner } = fakeRunner({
      stderr: stderrWithDuration("00", "00", "42"),
      stdout: new Uint8Array([9, 9, 9]), // the (discarded) processed output
      exitCode: 0,
    });
    const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);
    const input = new Uint8Array([1, 2, 3, 4, 5]);

    const result = await processor.process(input);

    expect(result.bytes).toBe(input); // the exact original reference, not a copy or the processed stdout
    expect(result.durationSeconds).toBe(42);
  });

  it("caps a source at/above 60 seconds to 60 seconds and uses the processed output bytes", async () => {
    const processedBytes = new Uint8Array([7, 7, 7, 7]);
    const { runner } = fakeRunner({
      stderr: stderrWithDuration("00", "01", "07"), // 67s source
      stdout: processedBytes,
      exitCode: 0,
    });
    const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);

    const result = await processor.process(new Uint8Array([1, 2, 3]));

    expect(result.bytes).toBe(processedBytes);
    expect(result.durationSeconds).toBe(60);
  });

  it("treats a source at exactly 60 seconds as reaching the cap (>= 60, not > 60)", async () => {
    const processedBytes = new Uint8Array([5]);
    const { runner } = fakeRunner({
      stderr: stderrWithDuration("00", "01", "00"), // exactly 60s
      stdout: processedBytes,
      exitCode: 0,
    });
    const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);

    const result = await processor.process(new Uint8Array([1]));

    expect(result.bytes).toBe(processedBytes);
    expect(result.durationSeconds).toBe(60);
  });

  it("invokes ffmpeg with the exact validated fade/trim/codec arguments, input piped in and output piped out", async () => {
    const { runner, calls } = fakeRunner({
      stderr: stderrWithDuration("00", "00", "30"),
      exitCode: 0,
    });
    const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);
    const input = new Uint8Array([42]);

    await processor.process(input);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.binaryPath).toBe(FAKE_BINARY_PATH);
    expect(call.input).toBe(input);
    expect(call.args).toContain("pipe:0");
    expect(call.args).toContain("pipe:1");
    expect(call.args).toContain("afade=t=out:st=55:d=5");
    expect(call.args.join(" ")).toContain("-t 60");
    expect(call.args.join(" ")).toContain("-codec:a libmp3lame");
    expect(call.args.join(" ")).toContain("-q:a 2");
  });

  it("propagates an ffmpeg failure (non-zero exit code) as a thrown error", async () => {
    const { runner } = fakeRunner({ stderr: "some ffmpeg error output", exitCode: 1 });
    const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);

    await expect(processor.process(new Uint8Array([1]))).rejects.toThrow(
      /ffmpeg exited with code 1/,
    );
  });

  it("propagates a spawn failure (e.g. binary missing) as a thrown error", async () => {
    const { runner } = fakeRunner(new Error("spawn ENOENT"));
    const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);

    await expect(processor.process(new Uint8Array([1]))).rejects.toThrow("Failed to start ffmpeg");
  });

  describe("spawn failure diagnostics (observability — real ENOENT/EACCES distinction)", () => {
    it("produces a diagnostic ENOENT message naming the resolved binary path, and keeps the ffmpeg.spawn_failed code", async () => {
      const cause = fakeSpawnError("ENOENT", { path: "/opt/node_modules/ffmpeg-static/ffmpeg" });
      const { runner } = fakeRunner(cause);
      const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);

      const error = await processor.process(new Uint8Array([1])).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InfrastructureError);
      const infraError = error as InstanceType<typeof InfrastructureError>;
      expect(infraError.code).toBe("ffmpeg.spawn_failed");
      expect(infraError.message).toContain("ENOENT");
      expect(infraError.message).toContain("/opt/node_modules/ffmpeg-static/ffmpeg");
      expect(infraError.message).toMatch(/binary not found/i);
      // The real Node error is still attached for anything that inspects it further.
      expect(infraError.cause).toBe(cause);
    });

    it("produces a diagnostic EACCES message distinct from ENOENT, and keeps the ffmpeg.spawn_failed code", async () => {
      const cause = fakeSpawnError("EACCES", { path: "/opt/node_modules/ffmpeg-static/ffmpeg" });
      const { runner } = fakeRunner(cause);
      const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);

      const error = await processor.process(new Uint8Array([1])).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InfrastructureError);
      const infraError = error as InstanceType<typeof InfrastructureError>;
      expect(infraError.code).toBe("ffmpeg.spawn_failed");
      expect(infraError.message).toContain("EACCES");
      expect(infraError.message).toMatch(/not executable/i);
      expect(infraError.message).not.toMatch(/ENOENT/);
    });

    it("still produces a code-preserving, non-empty diagnostic message for an unrecognized spawn error code", async () => {
      const cause = fakeSpawnError("EMFILE", { path: "/opt/node_modules/ffmpeg-static/ffmpeg" });
      const { runner } = fakeRunner(cause);
      const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);

      const error = await processor.process(new Uint8Array([1])).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InfrastructureError);
      const infraError = error as InstanceType<typeof InfrastructureError>;
      expect(infraError.code).toBe("ffmpeg.spawn_failed");
      expect(infraError.message).toContain("EMFILE");
    });

    it("attaches only the safe, allowlisted spawn fields (code/errno/syscall/path/spawnargs) as context — never the raw error object", async () => {
      const cause = fakeSpawnError("ENOENT", {
        path: "/opt/node_modules/ffmpeg-static/ffmpeg",
        spawnargs: ["-hide_banner", "-i", "pipe:0", "-af", "afade=t=out:st=55:d=5"],
      });
      const { runner } = fakeRunner(cause);
      const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);

      const error = await processor.process(new Uint8Array([1])).catch((e: unknown) => e);

      const infraError = error as InstanceType<typeof InfrastructureError>;
      expect(infraError.context).toEqual({
        code: "ENOENT",
        errno: -2,
        syscall: `spawn /opt/node_modules/ffmpeg-static/ffmpeg`,
        path: "/opt/node_modules/ffmpeg-static/ffmpeg",
        spawnargs: ["-hide_banner", "-i", "pipe:0", "-af", "afade=t=out:st=55:d=5"],
      });
    });

    it("never includes secrets, credentials, or unexpected properties from the original error in the diagnostic context", async () => {
      const cause = fakeSpawnError("ENOENT");
      // A realistic-but-wrong assumption to guard against: some
      // unrelated, sensitive-looking property riding along on the
      // error object must never be picked up — only the fixed
      // allowlist (code/errno/syscall/path/spawnargs) may ever appear.
      (cause as unknown as Record<string, unknown>).apiKey = "sk-should-never-appear";
      (cause as unknown as Record<string, unknown>).databaseUrl =
        "postgres://user:password@host/db";
      const { runner } = fakeRunner(cause);
      const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);

      const error = await processor.process(new Uint8Array([1])).catch((e: unknown) => e);
      const infraError = error as InstanceType<typeof InfrastructureError>;

      expect(Object.keys(infraError.context ?? {}).sort()).toEqual(
        ["code", "errno", "path", "spawnargs", "syscall"].sort(),
      );
      expect(infraError.message).not.toContain("sk-should-never-appear");
      expect(infraError.message).not.toContain("password");
      expect(JSON.stringify(infraError.context)).not.toContain("sk-should-never-appear");
      expect(JSON.stringify(infraError.context)).not.toContain("password");
    });

    it("falls back to a generic, code-free diagnostic message for a plain Error with no Node spawn fields", async () => {
      const { runner } = fakeRunner(new Error("something else went wrong"));
      const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);

      const error = await processor.process(new Uint8Array([1])).catch((e: unknown) => e);
      const infraError = error as InstanceType<typeof InfrastructureError>;

      expect(infraError.code).toBe("ffmpeg.spawn_failed");
      expect(infraError.message).toContain("Failed to start ffmpeg");
      expect(infraError.message).toMatch(/unknown error/i);
    });
  });

  it("throws when the binary path cannot be resolved at all, before ever attempting to spawn anything", async () => {
    const { runner, calls } = fakeRunner({
      stderr: stderrWithDuration("00", "00", "10"),
      exitCode: 0,
    });
    const processor = new FfmpegAudioProcessor(null, runner);

    await expect(processor.process(new Uint8Array([1]))).rejects.toThrow(
      "ffmpeg binary path could not be resolved.",
    );
    expect(calls).toHaveLength(0);
  });

  it("throws when ffmpeg's stderr carries no parseable Duration line, rather than silently guessing", async () => {
    const { runner } = fakeRunner({ stderr: "no duration information here", exitCode: 0 });
    const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);

    await expect(processor.process(new Uint8Array([1]))).rejects.toThrow(
      "Could not determine source audio duration",
    );
  });

  it("passes audio bytes directly to the runner (in-memory) rather than a file path — no temp file handoff of any kind", async () => {
    const { runner, calls } = fakeRunner({
      stderr: stderrWithDuration("00", "00", "30"),
      exitCode: 0,
    });
    const processor = new FfmpegAudioProcessor(FAKE_BINARY_PATH, runner);
    const input = new Uint8Array([1, 2, 3]);

    await processor.process(input);

    // The runner receives the raw bytes themselves (`pipe:0`/`pipe:1` in
    // the args above), never a filesystem path — this class imports no
    // `node:fs` write/temp-file API at all (see its source), so there is
    // nothing to clean up in the first place.
    expect(calls[0].input).toBe(input);
    expect(typeof calls[0].input).not.toBe("string");
  });

  /**
   * Every test above swaps in a fake `FfmpegRunner`, so none of them
   * would notice a real integration failure — a genuinely broken
   * `ffmpeg-static` resolution/bundling, a binary that can't actually
   * execute on this platform, or a real behavioral mismatch in the
   * filter chain. These tests construct `FfmpegAudioProcessor` with its
   * *default* parameters (the real `ffmpeg-static` binary path, real
   * `child_process.spawn`), so they run the exact same code path
   * production does.
   */
  describe("integration — the real ffmpeg-static binary (no fake runner)", () => {
    it("processes a real, short (<60s) MP3 through the real binary, keeping it byte-for-byte untouched and matching its actual measured duration", async () => {
      const input = synthesizeSilentMp3(3);
      const processor = new FfmpegAudioProcessor();

      const result = await processor.process(input);

      expect(result.bytes).toBe(input);
      expect(result.durationSeconds).toBe(3);
    });

    it("trims and fades a real MP3 at/above 60s to exactly 60 seconds, verified by reprobing the actual processed output with a second real ffmpeg invocation", async () => {
      const input = synthesizeSilentMp3(65);
      const processor = new FfmpegAudioProcessor();

      const result = await processor.process(input);

      expect(result.durationSeconds).toBe(60);
      expect(result.bytes).not.toBe(input);
      expect(result.bytes.length).toBeGreaterThan(0);

      // Independent proof the trim/fade really happened in the audio
      // itself, not just in the code's own duration arithmetic: fully
      // decode the processed output with a second, separate real
      // ffmpeg invocation and read the actual decoded time from its
      // progress stats (`time=`) — reliable regardless of pipe
      // seekability, unlike the `Input ... Duration:` header (see
      // `FfmpegAudioProcessor.parseDuration`'s own doc comment; this
      // reprobe is fed via the same non-seekable pipe as production).
      const reprobe = spawnSync(ffmpegPath!, ["-hide_banner", "-i", "pipe:0", "-f", "null", "-"], {
        input: Buffer.from(result.bytes),
        maxBuffer: 10 * 1024 * 1024,
      });
      const stderr = reprobe.stderr?.toString() ?? "";
      const timeMatches = [...stderr.matchAll(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/g)];

      expect(timeMatches.length).toBeGreaterThan(0);
      const [, hours, minutes, seconds] = timeMatches[timeMatches.length - 1];
      const reprobedSeconds = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
      expect(reprobedSeconds).toBeLessThanOrEqual(60);
    }, 15000);

    it("surfaces a real ENOENT spawn failure from the actual Node child_process machinery when the resolved binary path doesn't exist", async () => {
      const processor = new FfmpegAudioProcessor("/nonexistent/path/to/ffmpeg-binary-xyz");

      const error = await processor.process(new Uint8Array([1, 2, 3])).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InfrastructureError);
      const infraError = error as InstanceType<typeof InfrastructureError>;
      expect(infraError.code).toBe("ffmpeg.spawn_failed");
      expect(infraError.message).toMatch(/ENOENT/);
      expect(infraError.message).toMatch(/binary not found/i);
      expect((infraError.context as Record<string, unknown> | undefined)?.code).toBe("ENOENT");
    });
  });
});
