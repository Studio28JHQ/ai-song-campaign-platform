import type {
  AdminSessionPayload,
  IssuedSessionToken,
  SessionTokenService,
} from "@/application/admin/contracts/SessionTokenService";
import { appConfig } from "@/config/app";

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
const REMEMBER_ME_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

interface TokenBody extends AdminSessionPayload {
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  // `new Uint8Array(n)` always backs onto a fresh, non-shared `ArrayBuffer`
  // (unlike `Uint8Array.from`, which TS 5.7's stricter `BufferSource`
  // typing rejects as a `crypto.subtle` argument).
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importSigningKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appConfig.admin.sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Stateless, tamper-proof session token: a base64url-encoded JSON payload
 * plus an HMAC-SHA256 signature over it, verified with a server-only
 * secret (`appConfig.admin.sessionSecret`). Built on Web Crypto
 * (`crypto.subtle`) rather than Node's `crypto` module so the exact same
 * code runs unmodified in both the login API route (Node.js runtime) and
 * `middleware.ts` (Edge runtime) — see
 * docs/Architecture/System_Architecture.md.
 */
export class SignedSessionTokenService implements SessionTokenService {
  async issue(
    payload: AdminSessionPayload,
    options: { rememberMe?: boolean } = {},
  ): Promise<IssuedSessionToken> {
    const ttlMs = options.rememberMe ? REMEMBER_ME_TTL_MS : DEFAULT_TTL_MS;
    const expiresAt = new Date(Date.now() + ttlMs);

    const body: TokenBody = { ...payload, exp: expiresAt.getTime() };
    const encodedBody = base64UrlEncode(new TextEncoder().encode(JSON.stringify(body)));

    const key = await importSigningKey();
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedBody));

    const token = `${encodedBody}.${base64UrlEncode(new Uint8Array(signature))}`;
    return { token, expiresAt };
  }

  async verify(token: string): Promise<AdminSessionPayload | null> {
    const [encodedBody, encodedSignature] = token.split(".");
    if (!encodedBody || !encodedSignature) return null;

    try {
      const key = await importSigningKey();
      const isValid = await crypto.subtle.verify(
        "HMAC",
        key,
        base64UrlDecode(encodedSignature),
        new TextEncoder().encode(encodedBody),
      );
      if (!isValid) return null;

      const decoded = new TextDecoder().decode(base64UrlDecode(encodedBody));
      const parsed = JSON.parse(decoded) as Partial<TokenBody>;

      if (
        typeof parsed.exp !== "number" ||
        typeof parsed.adminId !== "string" ||
        typeof parsed.email !== "string"
      ) {
        return null;
      }

      if (Date.now() >= parsed.exp) return null;

      return { adminId: parsed.adminId, email: parsed.email };
    } catch {
      return null;
    }
  }
}
