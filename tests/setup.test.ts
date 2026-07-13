import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("test infrastructure", () => {
  it("resolves the @ path alias and runs a basic assertion", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
});
