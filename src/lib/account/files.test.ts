import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listUserFiles, removeUserFiles } from "./files";

describe("complete deletion of private files", () => {
  it("walks nested folders and every page, then removes files in bounded batches", async () => {
    const files = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), name: `photo-${i}` }));
    const list = vi.fn(async (prefix: string, { offset }: { offset: number }) => ({
      data: prefix === "user" ? [{ id: null, name: "looks" }] : files.slice(offset, offset + 1000), error: null,
    }));
    const remove = vi.fn().mockResolvedValue({ error: null });
    const client = { storage: { from: () => ({ list, remove }) } } as unknown as SupabaseClient;
    await removeUserFiles(client, "clara", "user");
    expect(list).toHaveBeenCalledWith("user/looks", expect.objectContaining({ offset: 1000 }));
    const deleted = remove.mock.calls.flatMap(([paths]) => paths);
    expect(deleted).toHaveLength(1001);
    expect(deleted).toContain("user/looks/photo-1000");
    expect(remove.mock.calls.every(([paths]) => paths.length <= 100)).toBe(true);
  });

  it("stops deletion when listing fails instead of claiming success", async () => {
    const error = new Error("storage unavailable");
    const remove = vi.fn();
    const client = { storage: { from: () => ({ list: vi.fn().mockResolvedValue({ data: null, error }), remove }) } } as unknown as SupabaseClient;
    await expect(listUserFiles(client, "clara", "user")).rejects.toBe(error);
    expect(remove).not.toHaveBeenCalled();
  });

  it("propagates a failed removal", async () => {
    const error = new Error("delete denied");
    const client = { storage: { from: () => ({
      list: vi.fn().mockResolvedValue({ data: [{ id: "1", name: "photo" }], error: null }),
      remove: vi.fn().mockResolvedValue({ error }),
    }) } } as unknown as SupabaseClient;
    await expect(removeUserFiles(client, "clara", "user")).rejects.toBe(error);
  });
});
