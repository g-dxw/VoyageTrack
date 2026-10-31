import { beforeEach, describe, expect, it, vi } from "vitest";
const loadFeatured = vi.hoisted(() => vi.fn());
vi.mock("$lib/server/homepage_featured", () => ({ loadHomepageFeaturedTrails: loadFeatured }));
import { GET } from "./+server";

const event = {
    locals: { pb: { baseURL: "https://database.example", authStore: { token: "signed-in-token" } } },
} as unknown as Parameters<typeof GET>[0];

describe("featured trail endpoint", () => {
    beforeEach(() => vi.resetAllMocks());
    it("passes only the database origin, and prevents stale visibility caching", async () => {
        loadFeatured.mockResolvedValue([]);
        const result = await GET(event);
        expect(loadFeatured).toHaveBeenCalledExactlyOnceWith("https://database.example");
        expect(result.status).toBe(200);
        expect(result.headers.get("Cache-Control")).toBe("no-store");
        expect(await result.json()).toEqual([]);
    });
    it("returns an unavailable response without upstream credentials or diagnostics", async () => {
        loadFeatured.mockRejectedValue(new Error("private upstream details"));
        const logger = vi.spyOn(console, "error").mockImplementation(() => {});
        const result = await GET(event);
        expect(result.status).toBe(503);
        expect(result.headers.get("Cache-Control")).toBe("no-store");
        expect(await result.json()).toEqual({ message: "featured_trails_unavailable" });
        logger.mockRestore();
    });
});
