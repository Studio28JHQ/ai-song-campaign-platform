import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminLeadDeletionGate,
  AdminLeadDeletionSummary,
} from "@/application/admin/contracts/AdminLeadDeletionGate";
import { DeleteLeadUseCase } from "@/application/admin/use-cases/DeleteLeadUseCase";
import type { AuditLogEntry } from "@/domain/admin/entities/AuditLogEntry";
import type { AuditLogRepository } from "@/domain/admin/repositories/AuditLogRepository";
import type { AudioStorageCleaner } from "@/application/admin/contracts/AudioStorageCleaner";
import { BusinessRuleError, DatabaseError, ExternalApiError } from "@/shared/errors";

/**
 * Sprint FINAL-5 — Test Data Cleanup.
 *
 * What these tests hold in place is that an irreversible operation is
 * precise: it removes the family it was asked for and nothing else, it
 * records what it removed before the record is gone, and it never
 * reports success for a deletion that did not happen.
 */

const SUMMARY: AdminLeadDeletionSummary = {
  id: "11111111-1111-1111-1111-111111111111",
  parentName: "Jane Doe",
  babyName: "Baby Doe",
  email: "jane@example.com",
  songCount: 1,
};

/**
 * Stands in for the schema's cascade: one store of families, one of
 * everything that hangs off them. Deleting a family drops its dependents
 * in the same call, which is what `ON DELETE CASCADE` gives us in one
 * statement, and what the use case is entitled to assume.
 */
function inMemoryGate(options: { failOnDelete?: boolean; missing?: boolean } = {}) {
  const families = new Map<string, AdminLeadDeletionSummary>();
  const dependents = new Map<string, string[]>();
  const audioKeys = new Map<string, string[]>();

  if (!options.missing) {
    families.set(SUMMARY.id, SUMMARY);
    dependents.set(SUMMARY.id, ["lyrics:v1", "song:1", "attempt:1", "session:1"]);
    audioKeys.set(SUMMARY.id, [`songs/${SUMMARY.id}.mp3`]);
  }
  // A second family, to prove the blast radius.
  families.set("22222222-2222-2222-2222-222222222222", { ...SUMMARY, id: "2222" });
  dependents.set("22222222-2222-2222-2222-222222222222", ["lyrics:v1", "song:1"]);
  audioKeys.set("22222222-2222-2222-2222-222222222222", ["songs/other-family.mp3"]);

  const gate: AdminLeadDeletionGate = {
    async findDeletionSummary(leadId) {
      return families.get(leadId) ?? null;
    },
    async findAudioStorageKeys(leadId) {
      return audioKeys.get(leadId) ?? [];
    },
    async delete(leadId) {
      if (options.failOnDelete) {
        throw new DatabaseError("Unexpected database error while deleting a family.", {
          code: "admin.unexpected_database_error",
        });
      }
      if (!families.has(leadId)) return false;
      families.delete(leadId);
      dependents.delete(leadId);
      audioKeys.delete(leadId);
      return true;
    },
  };

  return { gate, families, dependents, audioKeys };
}

/** Stands in for R2 — records what was asked for, and can be made to fail. */
function inMemoryStorage(options: { fail?: boolean } = {}) {
  const deleted: string[] = [];
  const cleaner: AudioStorageCleaner = {
    async delete(key) {
      if (options.fail) {
        throw new ExternalApiError("Cloudflare R2 delete failed.", { code: "r2.delete_failed" });
      }
      deleted.push(key);
    },
  };
  return { cleaner, deleted };
}

function recordingAuditLog() {
  const entries: AuditLogEntry[] = [];
  const repository: AuditLogRepository = {
    async create(entry: AuditLogEntry) {
      entries.push(entry);
      return entry;
    },
    async findByEntity() {
      return [];
    },
    async search() {
      return { items: [], total: 0 };
    },
  } as unknown as AuditLogRepository;

  return { repository, entries };
}

describe("DeleteLeadUseCase", () => {
  let audit: ReturnType<typeof recordingAuditLog>;

  beforeEach(() => {
    audit = recordingAuditLog();
  });

  it("[4] deletes a family that has no song", async () => {
    const { gate, families } = inMemoryGate();
    const withoutSong = { ...SUMMARY, id: "33333333-3333-3333-3333-333333333333", songCount: 0 };
    families.set(withoutSong.id, withoutSong);

    const result = await new DeleteLeadUseCase(
      gate,
      audit.repository,
      inMemoryStorage().cleaner,
    ).execute({
      leadId: withoutSong.id,
      adminId: "admin-1",
    });

    expect(result.deleted.songCount).toBe(0);
    expect(families.has(withoutSong.id)).toBe(false);
  });

  it("[5] deletes a family's dependent records along with it, and touches no other family", async () => {
    const { gate, families, dependents } = inMemoryGate();

    await new DeleteLeadUseCase(gate, audit.repository, inMemoryStorage().cleaner).execute({
      leadId: SUMMARY.id,
      adminId: "admin-1",
    });

    expect(families.has(SUMMARY.id)).toBe(false);
    expect(dependents.has(SUMMARY.id)).toBe(false);
    // The other family and everything of its own survive untouched.
    expect(families.has("22222222-2222-2222-2222-222222222222")).toBe(true);
    expect(dependents.get("22222222-2222-2222-2222-222222222222")).toEqual(["lyrics:v1", "song:1"]);
  });

  it("[6] deletes regardless of what state the song is in", async () => {
    // The use case never looks at the song's status, which is the point:
    // a queued, generating, completed or failed song is removed by the
    // same cascade, and there is no branch here that could disagree.
    for (const songCount of [0, 1]) {
      const { gate, families } = inMemoryGate();
      families.set(SUMMARY.id, { ...SUMMARY, songCount });

      await new DeleteLeadUseCase(gate, audit.repository, inMemoryStorage().cleaner).execute({
        leadId: SUMMARY.id,
        adminId: "admin-1",
      });

      expect(families.has(SUMMARY.id)).toBe(false);
    }
  });

  it("[7][8] leaves nothing half-deleted when the delete fails", async () => {
    const { gate, families, dependents } = inMemoryGate({ failOnDelete: true });

    await expect(
      new DeleteLeadUseCase(gate, audit.repository, inMemoryStorage().cleaner).execute({
        leadId: SUMMARY.id,
        adminId: "admin-1",
      }),
    ).rejects.toBeInstanceOf(DatabaseError);

    // The family and every dependent are still there, and nothing was
    // written to the audit trail for a deletion that did not happen.
    expect(families.has(SUMMARY.id)).toBe(true);
    expect(dependents.get(SUMMARY.id)).toHaveLength(4);
    expect(audit.entries).toHaveLength(0);
  });

  it("refuses a family that does not exist, without writing an audit entry", async () => {
    const { gate } = inMemoryGate({ missing: true });

    await expect(
      new DeleteLeadUseCase(gate, audit.repository, inMemoryStorage().cleaner).execute({
        leadId: SUMMARY.id,
        adminId: "admin-1",
      }),
    ).rejects.toMatchObject({ code: "admin.lead_not_found" });

    expect(audit.entries).toHaveLength(0);
  });

  it("reports a family deleted between the read and the delete as not found", async () => {
    const { gate, families } = inMemoryGate();
    const original = gate.findDeletionSummary.bind(gate);
    gate.findDeletionSummary = async (leadId) => {
      const summary = await original(leadId);
      families.delete(leadId); // someone else got there first
      return summary;
    };

    await expect(
      new DeleteLeadUseCase(gate, audit.repository, inMemoryStorage().cleaner).execute({
        leadId: SUMMARY.id,
        adminId: "admin-1",
      }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(audit.entries).toHaveLength(0);
  });

  it("records who deleted what, keeping the details the row can no longer hold", async () => {
    const { gate } = inMemoryGate();

    await new DeleteLeadUseCase(gate, audit.repository, inMemoryStorage().cleaner).execute({
      leadId: SUMMARY.id,
      adminId: "admin-7",
    });

    expect(audit.entries).toHaveLength(1);
    const entry = audit.entries[0].toSnapshot();
    expect(entry.action).toBe("delete_lead");
    expect(entry.entity).toBe("Lead");
    expect(entry.entityId).toBe(SUMMARY.id);
    expect(entry.adminId).toBe("admin-7");
    expect(entry.metadata).toMatchObject({
      parentName: "Jane Doe",
      babyName: "Baby Doe",
      email: "jane@example.com",
      songCount: 1,
    });
  });

  it("still reports success when the audit trail cannot be written", async () => {
    // The family is already gone; failing here would invite a retry on a
    // row that no longer exists. The loss is logged instead.
    const { gate, families } = inMemoryGate();
    const failing = {
      create: vi.fn().mockRejectedValue(new Error("audit unavailable")),
    } as unknown as AuditLogRepository;

    const result = await new DeleteLeadUseCase(gate, failing, inMemoryStorage().cleaner).execute({
      leadId: SUMMARY.id,
      adminId: "admin-1",
    });

    expect(result.deleted.id).toBe(SUMMARY.id);
    expect(families.has(SUMMARY.id)).toBe(false);
  });
  describe("stored audio", () => {
    it("removes the family's own audio from storage, after the database delete has succeeded", async () => {
      const { gate, families } = inMemoryGate();
      const storage = inMemoryStorage();

      await new DeleteLeadUseCase(gate, audit.repository, storage.cleaner).execute({
        leadId: SUMMARY.id,
        adminId: "admin-1",
      });

      expect(families.has(SUMMARY.id)).toBe(false);
      expect(storage.deleted).toEqual([`songs/${SUMMARY.id}.mp3`]);
    });

    it("never touches an object belonging to another family", async () => {
      const { gate } = inMemoryGate();
      const storage = inMemoryStorage();

      await new DeleteLeadUseCase(gate, audit.repository, storage.cleaner).execute({
        leadId: SUMMARY.id,
        adminId: "admin-1",
      });

      expect(storage.deleted).not.toContain("songs/other-family.mp3");
      expect(storage.deleted).toHaveLength(1);
    });

    it("asks storage for nothing when the family has no audio", async () => {
      const { gate, families, audioKeys } = inMemoryGate();
      const withoutSong = { ...SUMMARY, id: "33333333-3333-3333-3333-333333333333", songCount: 0 };
      families.set(withoutSong.id, withoutSong);
      audioKeys.set(withoutSong.id, []);
      const storage = inMemoryStorage();

      await new DeleteLeadUseCase(gate, audit.repository, storage.cleaner).execute({
        leadId: withoutSong.id,
        adminId: "admin-1",
      });

      expect(storage.deleted).toEqual([]);
    });

    it("reads the keys before the delete, while the rows that hold them still exist", async () => {
      const { gate } = inMemoryGate();
      const order: string[] = [];
      const traced = {
        ...gate,
        findAudioStorageKeys: async (leadId: string) => {
          order.push("read-keys");
          return gate.findAudioStorageKeys(leadId);
        },
        delete: async (leadId: string) => {
          order.push("delete-db");
          return gate.delete(leadId);
        },
      };
      const storage = inMemoryStorage();

      await new DeleteLeadUseCase(traced, audit.repository, storage.cleaner).execute({
        leadId: SUMMARY.id,
        adminId: "admin-1",
      });

      expect(order).toEqual(["read-keys", "delete-db"]);
    });

    it("deletes no audio when the database delete failed", async () => {
      // The family is still there, so its audio must be too.
      const { gate } = inMemoryGate({ failOnDelete: true });
      const storage = inMemoryStorage();

      await expect(
        new DeleteLeadUseCase(gate, audit.repository, storage.cleaner).execute({
          leadId: SUMMARY.id,
          adminId: "admin-1",
        }),
      ).rejects.toBeInstanceOf(DatabaseError);

      expect(storage.deleted).toEqual([]);
    });

    it("still reports success when storage fails, since the deletion itself did not", async () => {
      // Two independent systems, no shared transaction: turning a
      // committed delete into a reported failure would invite a retry on
      // a family that no longer exists, and the object would still be
      // there. It is logged instead.
      const { gate, families } = inMemoryGate();
      const storage = inMemoryStorage({ fail: true });

      const result = await new DeleteLeadUseCase(gate, audit.repository, storage.cleaner).execute({
        leadId: SUMMARY.id,
        adminId: "admin-1",
      });

      expect(result.deleted.id).toBe(SUMMARY.id);
      expect(families.has(SUMMARY.id)).toBe(false);
      // And the deletion is still recorded: it happened.
      expect(audit.entries).toHaveLength(1);
    });

    it("keeps going through the remaining objects when one of them fails", async () => {
      const { gate, audioKeys } = inMemoryGate();
      audioKeys.set(SUMMARY.id, ["songs/a.mp3", "songs/b.mp3"]);
      const deleted: string[] = [];
      const cleaner: AudioStorageCleaner = {
        async delete(key) {
          if (key === "songs/a.mp3") throw new Error("transient");
          deleted.push(key);
        },
      };

      await new DeleteLeadUseCase(gate, audit.repository, cleaner).execute({
        leadId: SUMMARY.id,
        adminId: "admin-1",
      });

      expect(deleted).toEqual(["songs/b.mp3"]);
    });
  });
});
