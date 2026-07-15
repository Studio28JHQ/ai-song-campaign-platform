import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { PasswordHasher } from "@/application/admin/contracts/PasswordHasher";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Password hashing via Node's built-in `scrypt` — no external dependency
 * (bcrypt/argon2), consistent with this project's preference for
 * minimal, self-owned infrastructure (see `MurekaClient`/`ClaudeClient`,
 * which use the shared `httpRequest` helper instead of vendor SDKs).
 * Stored format: `<saltHex>:<derivedKeyHex>`.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
    return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    const [saltHex, hashHex] = passwordHash.split(":");
    if (!saltHex || !hashHex) return false;

    const salt = Buffer.from(saltHex, "hex");
    const storedKey = Buffer.from(hashHex, "hex");
    const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer;

    return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
  }
}
