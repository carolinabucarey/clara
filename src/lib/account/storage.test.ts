import { afterEach, describe, expect, it, vi } from "vitest";
import { removeImages, signedUrls } from "./storage";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../supabase/client", () => ({ BUCKET: "clara", supabase: () => ({ storage: { from } }) }));
afterEach(() => vi.resetAllMocks());

describe("storage errors", () => {
  it("does not silently ignore a deletion error", async () => {
    from.mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: new Error("denied") }) });
    await expect(removeImages(["user/photo"])).rejects.toMatchObject({ code: "generic" });
  });
  it("does not treat failed URL signing as an empty gallery", async () => {
    from.mockReturnValue({ createSignedUrls: vi.fn().mockResolvedValue({ data: null, error: new Error("denied") }) });
    await expect(signedUrls(["user/photo"])).rejects.toMatchObject({ code: "generic" });
  });
});
