import { chmodSync } from "node:fs";
import { spawn } from "node:child_process";
import ffmpegBinaryPath from "ffmpeg-static";
import type { AudioProcessor, ProcessedAudio } from "@/application/song/contracts/AudioProcessor";
import { InfrastructureError } from "@/shared/errors";
import { logger } from "@/shared/logger/logger";

/** Validated behavior (external Mureka test script) — do not invent a different fade strategy. */
const FADE_START_SECONDS = 55;
const FADE_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 60;

/**
 * Matches ffmpeg's own `Input #0 ... Duration: <token>, ..., bitrate: <N>
 * kb/s` line. `<token>` is a real `HH:MM:SS.ss` timestamp when ffmpeg
 * could determine it outright, or the literal `N/A` when it couldn't —
 * which, verified against the real `ffmpeg-static` binary, is exactly
 * what happens for an MP3 read from a non-seekable pipe (`pipe:0`, this
 * class's only input mode — see `defaultRunner`): computing an exact
 * duration from a bitrate estimate requires the total file size, which
 * requires seeking to EOF, which a pipe can never support. `bitrate`,
 * unlike duration, is read from the stream's own header/early frames and
 * is reported either way — the fallback path below uses it.
 */
const DURATION_LINE =
  /Duration:\s*(N\/A|(\d{2}):(\d{2}):(\d{2})\.(\d{2})).*?bitrate:\s*([\d.]+)\s*kb\/s/;

export interface FfmpegRunResult {
  stdout: Uint8Array;
  stderr: string;
  exitCode: number | null;
}

/** The actual process boundary — swappable in tests so no real binary is ever spawned there. */
export type FfmpegRunner = (
  binaryPath: string,
  args: string[],
  input: Uint8Array,
) => Promise<FfmpegRunResult>;

/**
 * Spawns the real `ffmpeg` binary (`ffmpeg-static`, bundled as an npm
 * dependency so the correct platform binary is present in the deployed
 * Vercel function — see `next.config.ts`'s `outputFileTracingIncludes`,
 * which force-includes it since it's referenced only as a file path, not
 * a `require()`'d module the bundler's static tracer would otherwise
 * find on its own). Entirely pipe-based (`pipe:0` in, `pipe:1` out) —
 * no `/tmp`, no filesystem writes, nothing to clean up. Vercel's Node.js
 * Serverless Functions support `child_process` (this route never runs
 * under the Edge runtime); the binary needs its executable bit set once
 * per cold start, defensively re-applied here since some packaging
 * pipelines are known to strip it.
 */
function defaultRunner(
  binaryPath: string,
  args: string[],
  input: Uint8Array,
): Promise<FfmpegRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, { stdio: ["pipe", "pipe", "pipe"] });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode) => {
      resolve({
        stdout: new Uint8Array(Buffer.concat(stdoutChunks)),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode,
      });
    });

    // A write to stdin after ffmpeg has already exited (e.g. it rejected
    // malformed input immediately) would otherwise crash the process
    // with an uncaught EPIPE; the "close" handler above already reports
    // the real failure via a non-zero exit code.
    child.stdin.on("error", () => {});
    child.stdin.write(Buffer.from(input));
    child.stdin.end();
  });
}

let executableBitEnsured = false;

/**
 * Post-processes a provider-generated MP3 to the campaign's duration
 * rule (see `AudioProcessor`'s doc comment) — the single integration
 * point for FFmpeg in this pipeline (`GenerationPoller`, between
 * download and R2 upload). No VAD, no silence/speech detection: the
 * only signal used is the real, measured input duration, parsed from
 * ffmpeg's own stderr — Mureka's self-reported duration is deliberately
 * never trusted for this decision (it's the provider's own estimate,
 * not a guarantee).
 *
 * A single ffmpeg invocation always runs the exact validated filter
 * chain (`afade=t=out:st=55:d=5 -t 60 -codec:a libmp3lame -q:a 2`) and
 * always reports the source's real duration on stderr regardless of
 * whether that filter chain actually alters the output — cheaper than
 * probing and processing separately, and correct because `afade`/`-t`
 * are both no-ops on a stream that never reaches their timestamps. The
 * *decision* of which bytes to keep still branches on the parsed
 * duration: below 60s, the original, byte-for-byte untouched bytes are
 * kept (a shorter song is never re-encoded, let alone padded or faded);
 * at or above 60s, the filtered/encoded output is kept.
 */
export class FfmpegAudioProcessor implements AudioProcessor {
  constructor(
    private readonly binaryPath: string | null = ffmpegBinaryPath,
    private readonly run: FfmpegRunner = defaultRunner,
  ) {}

  async process(input: Uint8Array): Promise<ProcessedAudio> {
    if (!this.binaryPath) {
      throw new InfrastructureError("ffmpeg binary path could not be resolved.", {
        code: "ffmpeg.binary_not_found",
      });
    }

    this.ensureExecutable(this.binaryPath);

    const result = await this.run(this.binaryPath, this.buildArgs(), input).catch((cause) => {
      const details = FfmpegAudioProcessor.extractSpawnErrorDetails(cause);
      logger.error("ffmpeg failed to start", details);
      throw new InfrastructureError(FfmpegAudioProcessor.describeSpawnFailure(details), {
        code: "ffmpeg.spawn_failed",
        cause,
        context: details,
      });
    });

    if (result.exitCode !== 0) {
      logger.error("ffmpeg processing failed", {
        exitCode: result.exitCode,
        stderr: result.stderr.slice(-2000),
      });
      throw new InfrastructureError(`ffmpeg exited with code ${result.exitCode}.`, {
        code: "ffmpeg.processing_failed",
        context: { exitCode: result.exitCode },
      });
    }

    const sourceDurationSeconds = FfmpegAudioProcessor.parseDuration(result.stderr, input.length);
    if (sourceDurationSeconds === null) {
      throw new InfrastructureError(
        "Could not determine source audio duration from ffmpeg output.",
        { code: "ffmpeg.duration_unparseable" },
      );
    }

    if (sourceDurationSeconds < MAX_DURATION_SECONDS) {
      return { bytes: input, durationSeconds: Math.round(sourceDurationSeconds) };
    }

    return { bytes: result.stdout, durationSeconds: MAX_DURATION_SECONDS };
  }

  private buildArgs(): string[] {
    return [
      "-hide_banner",
      "-i",
      "pipe:0",
      "-af",
      `afade=t=out:st=${FADE_START_SECONDS}:d=${FADE_DURATION_SECONDS}`,
      "-t",
      String(MAX_DURATION_SECONDS),
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "2",
      "-f",
      "mp3",
      "pipe:1",
    ];
  }

  /** Best-effort, once per process — a failed chmod surfaces loudly anyway the moment `spawn` itself fails. */
  private ensureExecutable(binaryPath: string): void {
    if (executableBitEnsured) return;
    try {
      chmodSync(binaryPath, 0o755);
    } catch (error) {
      logger.warn("Could not set the ffmpeg binary's executable bit", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    executableBitEnsured = true;
  }

  /**
   * Prefers ffmpeg's own reported duration when it managed to determine
   * one outright. Otherwise (the real, verified pipe case — see
   * `DURATION_LINE`'s doc comment) falls back to the same
   * bitrate-based estimate ffmpeg itself uses for a seekable file (its
   * own "Estimating duration from bitrate" stderr note) — except ffmpeg
   * can't do that math over a pipe (no known total size), while this
   * class already holds the complete input in memory, so it does the
   * exact same arithmetic itself: `bytes * 8 / bitrate_bps`.
   */
  private static parseDuration(stderr: string, inputByteLength: number): number | null {
    const match = DURATION_LINE.exec(stderr);
    if (!match) return null;

    const [, durationToken, hours, minutes, seconds, centiseconds, bitrateKbps] = match;

    if (durationToken !== "N/A") {
      return (
        Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(centiseconds) / 100
      );
    }

    const bitrateBitsPerSecond = Number(bitrateKbps) * 1000;
    if (!Number.isFinite(bitrateBitsPerSecond) || bitrateBitsPerSecond <= 0) return null;

    return (inputByteLength * 8) / bitrateBitsPerSecond;
  }

  /**
   * Pulls only the specific, safe fields Node attaches to a `spawn`
   * `'error'` event (a `NodeJS.ErrnoException`) — never the raw error
   * object or its arbitrary own properties. `path` is the local ffmpeg
   * binary path and `spawnargs` is `buildArgs()`'s own CLI flags (see
   * above — no lyrics, no user content, no credentials ever reach this
   * class), so both are safe to log and persist. Deliberately defensive
   * (every field individually type-checked) since `cause` is `unknown`
   * — it could be a real Node spawn error, or, in a test, a plain
   * `Error` with none of these fields at all.
   */
  private static extractSpawnErrorDetails(cause: unknown): Record<string, unknown> {
    if (typeof cause !== "object" || cause === null) return {};

    const record = cause as Record<string, unknown>;
    const details: Record<string, unknown> = {};

    if (typeof record.code === "string") details.code = record.code;
    if (typeof record.errno === "number") details.errno = record.errno;
    if (typeof record.syscall === "string") details.syscall = record.syscall;
    if (typeof record.path === "string") details.path = record.path;
    if (Array.isArray(record.spawnargs)) details.spawnargs = record.spawnargs;

    return details;
  }

  /**
   * Builds a short, deterministic message distinguishing the failure
   * categories that actually matter operationally (ENOENT — the
   * resolved binary path doesn't exist; EACCES — it exists but isn't
   * executable; anything else) from the extracted, already-safe
   * details above — never by stringifying the original error. This is
   * the one piece that survives all the way to `Song.providerError`
   * (see `GenerationPoller`, which persists only `error.message`), so
   * it has to carry the useful distinction on its own.
   */
  private static describeSpawnFailure(details: Record<string, unknown>): string {
    const code = typeof details.code === "string" ? details.code : undefined;
    const path = typeof details.path === "string" ? details.path : undefined;
    const suffix = path ? ` at "${path}"` : "";

    if (code === "ENOENT") {
      return `Failed to start ffmpeg: binary not found (ENOENT)${suffix}.`;
    }
    if (code === "EACCES") {
      return `Failed to start ffmpeg: binary not executable (EACCES)${suffix}.`;
    }
    if (code) {
      return `Failed to start ffmpeg: spawn failed (${code})${suffix}.`;
    }
    return "Failed to start ffmpeg: spawn failed (unknown error).";
  }
}
