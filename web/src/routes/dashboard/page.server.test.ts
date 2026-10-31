import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { load } from "./+page.server";

const actor = "ownactor0000001";
function trail(id: string, publicValue: boolean, category = "hidden-category") {
    return {
        id, name: id, author: actor, public: publicValue, category, photos: [], tags: [],
        expand: { author: { preferred_username: "hiker", is_local: true } },
    };
}
function eventFor(search = "") {
    const items = [trail("publictrail0001", true), trail("privatetrail001", false)];
    const getList = vi.fn(async () => ({ items, page: 1, perPage: 12, totalItems: 2, totalPages: 1 }));
    const pb = {
        authStore: { isValid: true, record: { id: "user00000000001" } },
        collection: vi.fn(() => ({ getList })),
        filter: vi.fn(() => "author = 'ownactor0000001'"),
    };
    const event = {
        locals: { user: { id: "user00000000001", actor, username: "owner" }, pb },
        url: new URL(`https://voyagetrack.example/dashboard${search}`),
        setHeaders: vi.fn(),
    };
    return { event, pb, getList, items, run: () => load(event as unknown as Parameters<typeof load>[0]) };
}

describe("dashboard owner library", () => {
    beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
    afterEach(() => vi.restoreAllMocks());

    it("uses only the session actor and includes own private and hidden-category trails", async () => {
        const fixture = eventFor("?author=someone-else&public=true");
        const result = await fixture.run();
        expect(fixture.pb.collection).toHaveBeenCalledExactlyOnceWith("trails");
        expect(fixture.pb.filter).toHaveBeenCalledExactlyOnceWith("author = {:actor}", { actor });
        expect(fixture.getList).toHaveBeenCalledExactlyOnceWith(1, 12, {
            filter: "author = 'ownactor0000001'", sort: "-created,-id",
            expand: "author,category,subcategory", requestKey: null,
        });
        expect(result).toMatchObject({
            trails: { items: fixture.items }, loadError: false,
            trailLinks: {
                publictrail0001: "/trail/view/@hiker/publictrail0001",
                privatetrail001: "/trail/view/@hiker/privatetrail001",
            },
        });
        expect(fixture.items[0].author).toBe(actor);
        expect(fixture.event.setHeaders).toHaveBeenCalledWith({
            "cache-control": "private, no-store", vary: "Cookie, Authorization",
        });
    });

    it("uses the requested positive page with stable page size and order", async () => {
        const fixture = eventFor("?page=2");
        fixture.getList.mockResolvedValue({ items: fixture.items, page: 2, perPage: 12, totalItems: 14, totalPages: 2 });
        await fixture.run();
        expect(fixture.getList).toHaveBeenCalledWith(2, 12, expect.objectContaining({ sort: "-created,-id" }));
    });

    it.each(["", "0", "-1", "1.5", "abc", "2147483648", "9007199254740992"])("normalizes invalid page %j", async (page) => {
        const fixture = eventFor(`?page=${page}`);
        await fixture.run();
        expect(fixture.getList).toHaveBeenCalledWith(1, 12, expect.anything());
    });

    it("redirects an outdated page to the last real page instead of showing a false empty library", async () => {
        const fixture = eventFor("?page=5");
        fixture.getList.mockResolvedValue({ items: [], page: 5, perPage: 12, totalItems: 14, totalPages: 2 });
        await expect(fixture.run()).rejects.toMatchObject({ status: 303, location: "/dashboard?page=2" });
        expect(console.error).not.toHaveBeenCalled();
    });

    it("redirects to page one when the final trail has been removed", async () => {
        const fixture = eventFor("?page=2");
        fixture.getList.mockResolvedValue({ items: [], page: 2, perPage: 12, totalItems: 0, totalPages: 0 });
        await expect(fixture.run()).rejects.toMatchObject({ status: 303, location: "/dashboard?page=1" });
    });

    it("redirects an anonymous request before querying any private record", async () => {
        const fixture = eventFor("?page=2");
        Object.assign(fixture.event.locals, { user: null });
        await expect(fixture.run()).rejects.toMatchObject({ status: 303, location: "/login?r=%2Fdashboard%3Fpage%3D2" });
        expect(fixture.getList).not.toHaveBeenCalled();
    });

    it("redirects an expired session before querying", async () => {
        const fixture = eventFor();
        fixture.pb.authStore.isValid = false;
        await expect(fixture.run()).rejects.toMatchObject({ status: 303 });
        expect(fixture.getList).not.toHaveBeenCalled();
    });

    it("rejects a mismatched auth identity before querying", async () => {
        const fixture = eventFor();
        fixture.pb.authStore.record.id = "anotheruser0001";
        await expect(fixture.run()).rejects.toMatchObject({ status: 303 });
        expect(fixture.getList).not.toHaveBeenCalled();
    });

    it.each([undefined, "", "not-an-actor"])("guards an invalid actor %j without leaking or querying", async (value) => {
        const fixture = eventFor();
        Object.assign(fixture.event.locals.user, { actor: value });
        expect(await fixture.run()).toMatchObject({ loadError: true, trails: { items: [] } });
        expect(fixture.getList).not.toHaveBeenCalled();
    });

    it("keeps backend failures distinct from a valid empty library", async () => {
        const fixture = eventFor();
        fixture.getList.mockRejectedValue(new Error("upstream private diagnostics"));
        expect(await fixture.run()).toMatchObject({ loadError: true, trails: { items: [] } });
        expect(console.error).toHaveBeenCalledWith("Could not load dashboard trails");
    });

    it("returns a real empty library without an error", async () => {
        const fixture = eventFor();
        fixture.getList.mockResolvedValue({ items: [], page: 1, perPage: 12, totalItems: 0, totalPages: 0 });
        expect(await fixture.run()).toMatchObject({ loadError: false, trails: { items: [] } });
    });

    it("falls back to the authenticated username without rewriting the author ID", async () => {
        const fixture = eventFor();
        Object.assign(fixture.items[0], { expand: {} });
        expect(await fixture.run()).toMatchObject({
            loadError: false, trailLinks: { publictrail0001: "/trail/view/@owner/publictrail0001" },
        });
        expect(fixture.items[0].author).toBe(actor);
    });

    it("does not return a foreign record if the backend violates the ownership query", async () => {
        const fixture = eventFor();
        fixture.items[0].author = "foreignactor001";
        expect(await fixture.run()).toMatchObject({ loadError: true, trails: { items: [] } });
    });
});
