import { z } from "zod";
import { ExternalApiError } from "@/shared/errors";
import type { ClaudeContentBlock, ClaudeLyricsResult, ClaudeMessageResponse } from "./types";

const claudeLyricsResponseSchema = z
  .object({
    approved: z.boolean(),
    reason: z.string().nullable(),
    lyrics: z.string().nullable(),
  })
  .refine(
    (value) =>
      value.approved
        ? typeof value.lyrics === "string" && value.lyrics.trim().length > 0
        : typeof value.reason === "string" && value.reason.trim().length > 0,
    {
      message:
        "an approved response requires non-empty lyrics; a rejected response requires a non-empty reason.",
    },
  );

/**
 * Parses and validates Claude's Messages API response into the structured
 * moderation + lyrics result our prompt requests (see `PromptBuilder`).
 * Throws the shared `ExternalApiError` for any malformed or unexpected
 * shape — no raw Claude payload or parsing exception ever escapes this
 * class (see docs/Architecture/External_Services.md — "Claude API").
 */
export class ResponseParser {
  static parse(response: ClaudeMessageResponse): ClaudeLyricsResult {
    const text = ResponseParser.extractText(response);
    const json = ResponseParser.parseJson(text);
    return ResponseParser.validate(json);
  }

  private static extractText(response: ClaudeMessageResponse): string {
    const textBlock = response.content?.find(
      (block): block is ClaudeContentBlock & { text: string } =>
        block.type === "text" && typeof block.text === "string" && block.text.trim().length > 0,
    );

    if (!textBlock) {
      throw new ExternalApiError("Claude response did not contain any text content.", {
        code: "claude.empty_response",
      });
    }

    return textBlock.text;
  }

  private static parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch (cause) {
      throw new ExternalApiError("Claude response was not valid JSON.", {
        code: "claude.invalid_json",
        cause,
        context: { text },
      });
    }
  }

  private static validate(json: unknown): ClaudeLyricsResult {
    const result = claudeLyricsResponseSchema.safeParse(json);

    if (!result.success) {
      throw new ExternalApiError("Claude response did not match the expected schema.", {
        code: "claude.malformed_response",
        context: { issues: result.error.issues },
      });
    }

    return result.data;
  }
}
