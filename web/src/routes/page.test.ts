import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ categories: vi.fn(), subcategories: vi.fn(), feed: vi.fn(), featured: vi.fn() }));
vi.mock("$lib/stores/category_store", () => ({ categories_index: mocks.categories }));
vi.mock("$lib/stores/subcategory_store", () => ({ subcategories_index: mocks.subcategories }));
vi.mock("$lib/stores/feed_store", () => ({ feed_index: mocks.feed }));
vi.mock("$lib/stores/trail_store", () => ({ trails_featured: mocks.featured }));
import { load } from "./+page";

function loadEvent(user?: { id: string }) {
    return { fetch: vi.fn(), parent: vi.fn(async () => ({ user })) } as unknown as Parameters<typeof load>[0];
}

describe("public homepage independent loads", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.categories.mockResolvedValue([]);
        mocks.subcategories.mockResolvedValue([]);
        // A private feed is deliberately unavailable; it must never be needed.
        mocks.feed.mockRejectedValue(new Error("Private feed must not load here"));
        mocks.featured.mockResolvedValue([{ href: "/trail/view/@hiker/firsttrail00001" }]);
        vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it.each([undefined, { id: "signed-in" }])("serves the same public content without requesting a personal feed (user: %j)", async (user) => {
        const event = loadEvent(user);
        expect(await load(event)).toEqual({
            featuredTrails: [{ href: "/trail/view/@hiker/firsttrail00001" }],
            featuredTrailsUnavailable: false,
        });
        expect(mocks.feed).not.toHaveBeenCalled();
        expect(mocks.featured).toHaveBeenCalledWith(event.fetch);
    });

    it("keeps public featured content when category requests fail", async () => {
        mocks.categories.mockRejectedValue(new Error("category unavailable"));
        mocks.subcategories.mockRejectedValue(new Error("subcategory unavailable"));
        expect(await load(loadEvent({ id: "signed-in" }))).toEqual({
            featuredTrails: [{ href: "/trail/view/@hiker/firsttrail00001" }],
            featuredTrailsUnavailable: false,
        });
        expect(mocks.feed).not.toHaveBeenCalled();
    });

    it("exposes a featured load failure without adding personal data", async () => {
        mocks.featured.mockRejectedValue(new Error("featured unavailable"));
        expect(await load(loadEvent({ id: "signed-in" }))).toEqual({
            featuredTrails: [], featuredTrailsUnavailable: true,
        });
        expect(mocks.feed).not.toHaveBeenCalled();
    });

    it("does not label an empty configured list as a load failure", async () => {
        mocks.featured.mockResolvedValue([]);
        expect(await load(loadEvent())).toEqual({ featuredTrails: [], featuredTrailsUnavailable: false });
    });
});
