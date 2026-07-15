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
