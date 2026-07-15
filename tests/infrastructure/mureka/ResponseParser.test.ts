import { describe, expect, it } from "vitest";
import { ResponseParser } from "@/infrastructure/mureka/ResponseParser";

describe("ResponseParser.parse", () => {
  it("maps a valid submission response into the structured result", () => {
    const result = ResponseParser.parse({
      id: "task-123",
      created_at: 1700000000,
      model: "mureka-6",
      status: "preparing",
      trace_id: "trace-456",
    });

    expect(result).toEqual({
      providerTaskId: "task-123",
      providerTraceId: "trace-456",
      submittedAt: new Date(1700000000 * 1000),
      providerStatus: "preparing",
    });
  });

  it("accepts a numeric id/trace_id and normalizes both to strings", () => {
    const result = ResponseParser.parse({
      id: 435134,
      created_at: 1700000000,
      status: "preparing",
      trace_id: 998877,
    });

    expect(result.providerTaskId).toBe("435134");
    expect(result.providerTraceId).toBe("998877");
  });

  it("defaults providerTraceId to null when trace_id is omitted", () => {
    const result = ResponseParser.parse({
      id: "task-123",
      created_at: 1700000000,
      status: "preparing",
    });

    expect(result.providerTraceId).toBeNull();
  });

  it("defaults providerTraceId to null when trace_id is explicitly null", () => {
    const result = ResponseParser.parse({
      id: "task-123",
      created_at: 1700000000,
      status: "preparing",
      trace_id: null,
    });

    expect(result.providerTraceId).toBeNull();
  });

  it("throws a shared error when required fields are missing", () => {
    expect(() => ResponseParser.parse({ id: "task-123" })).toThrow();
  });

  it("throws a shared error when status is empty", () => {
    expect(() =>
      ResponseParser.parse({ id: "task-123", created_at: 1700000000, status: "" }),
    ).toThrow();
  });

  it("throws a shared error for a completely malformed payload", () => {
    expect(() => ResponseParser.parse({ foo: "bar" })).toThrow();
    expect(() => ResponseParser.parse(null)).toThrow();
    expect(() => ResponseParser.parse("not an object")).toThrow();
  });
});

describe("ResponseParser.parsePoll", () => {
  it.each(["preparing", "queued", "running", "streaming"])(
    "maps provider status %s to pending",
    (status) => {
      const result = ResponseParser.parsePoll({ id: "task-123", status });
      expect(result).toEqual({ status: "pending", providerStatus: status });
    },
  );

  it("maps an unrecognized status to pending, defensively", () => {
    const result = ResponseParser.parsePoll({ id: "task-123", status: "some-future-status" });
    expect(result).toEqual({ status: "pending", providerStatus: "some-future-status" });
  });

  it("maps succeeded with a choice into ready_to_download, converting duration from ms to seconds", () => {
    const result = ResponseParser.parsePoll({
      id: "task-123",
      status: "succeeded",
      choices: [{ id: "song-1", url: "https://cdn.mureka.ai/song-1.mp3", duration: 125000 }],
    });

    expect(result).toEqual({
      status: "ready_to_download",
      providerSongId: "song-1",
      audioUrl: "https://cdn.mureka.ai/song-1.mp3",
      duration: 125,
      providerStatus: "succeeded",
    });
  });

  it("falls back to the task id when a choice has no id of its own", () => {
    const result = ResponseParser.parsePoll({
      id: "task-123",
      status: "succeeded",
      choices: [{ url: "https://cdn.mureka.ai/song-1.mp3" }],
    });

    expect(result).toMatchObject({ status: "ready_to_download", providerSongId: "task-123" });
  });

  it("defaults duration to null when the choice omits it", () => {
    const result = ResponseParser.parsePoll({
      id: "task-123",
      status: "succeeded",
      choices: [{ url: "https://cdn.mureka.ai/song-1.mp3" }],
    });

    expect(result).toMatchObject({ duration: null });
  });

  it("throws when succeeded but choices is missing or empty", () => {
    expect(() => ResponseParser.parsePoll({ id: "task-123", status: "succeeded" })).toThrow();
    expect(() =>
      ResponseParser.parsePoll({ id: "task-123", status: "succeeded", choices: [] }),
    ).toThrow();
  });

  it("throws when succeeded but the choice has no url", () => {
    expect(() =>
      ResponseParser.parsePoll({
        id: "task-123",
        status: "succeeded",
        choices: [{ id: "song-1" }],
      }),
    ).toThrow();
  });

  it.each(["failed", "timeouted", "cancelled"])(
    "maps terminal provider status %s to failed",
    (status) => {
      const result = ResponseParser.parsePoll({
        id: "task-123",
        status,
        failed_reason: "The provider could not generate this song.",
      });

      expect(result).toEqual({
        status: "failed",
        error: "The provider could not generate this song.",
      });
    },
  );

  it("falls back to a generic message when a terminal failure has no failed_reason", () => {
    const result = ResponseParser.parsePoll({ id: "task-123", status: "failed" });
    expect(result).toEqual({ status: "failed", error: 'Mureka reported task status "failed".' });
  });

  it("throws a shared error for a completely malformed poll payload", () => {
    expect(() => ResponseParser.parsePoll({ foo: "bar" })).toThrow();
    expect(() => ResponseParser.parsePoll(null)).toThrow();
    expect(() => ResponseParser.parsePoll("not an object")).toThrow();
  });
});
