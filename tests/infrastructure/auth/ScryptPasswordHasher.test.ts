import { describe, expect, it } from "vitest";
import { ScryptPasswordHasher } from "@/infrastructure/auth/ScryptPasswordHasher";

describe("ScryptPasswordHasher", () => {
  it("hashes a password to a salt:hash pair distinct from the plaintext", async () => {
    const hasher = new ScryptPasswordHasher();
    const hash = await hasher.hash("correct horse battery staple");

    expect(hash).toContain(":");
    expect(hash).not.toContain("correct horse battery staple");
  });

  it("produces a different hash each time (random salt)", async () => {
    const hasher = new ScryptPasswordHasher();
    const [first, second] = await Promise.all([
      hasher.hash("password123"),
      hasher.hash("password123"),
    ]);

    expect(first).not.toBe(second);
  });

  it("verifies the correct password against its own hash", async () => {
    const hasher = new ScryptPasswordHasher();
    const hash = await hasher.hash("correct horse battery staple");

    await expect(hasher.verify("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hasher = new ScryptPasswordHasher();
    const hash = await hasher.hash("correct horse battery staple");

    await expect(hasher.verify("wrong password", hash)).resolves.toBe(false);
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    const hasher = new ScryptPasswordHasher();
    await expect(hasher.verify("anything", "not-a-valid-hash")).resolves.toBe(false);
  });
});
