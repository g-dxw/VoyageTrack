import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadHomepageFeaturedTrails } from "./homepage_featured";

const firstID = "firsttrail00001";
const secondID = "secondtrail0001";
function record(id: string, extra: Record<string, unknown> = {}) {
    return {
        id, collectionId: "trails_collection", collectionName: "trails",
        name: "Actual route name", public: true, photos: ["route.webp"],
        author: "actor0000000001",
        expand: { author: { preferred_username: "hiker", is_local: true } },
        ...extra,
    };
}
function response(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
describe("homepage featured trails", () => {
    const fetchMock = vi.fn<typeof fetch>();
    beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
    afterEach(() => vi.unstubAllGlobals());

    it("returns an honest empty list without requesting records", async () => {
        expect(await loadHomepageFeaturedTrails("https://database.example", [])).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("preserves configured order and original file/author metadata with anonymous reads", async () => {
        let finishFirst: (value: Response) => void = () => {};
        const firstResponse = new Promise<Response>((resolve) => { finishFirst = resolve; });
        const first = record(firstID);
        const second = record(secondID, {
            expand: { author: { preferred_username: "walker", is_local: false, domain: "mountains.example" } },
        });
        fetchMock.mockImplementation(async (url, options) => {
            expect(new Headers(options?.headers).has("Authorization")).toBe(false);
            expect(new Headers(options?.headers).has("Cookie")).toBe(false);
            expect(String(url)).toContain("expand=author%2Ccategory%2Csubcategory");
            if (String(url).includes(firstID)) return firstResponse;
            finishFirst(response(first));
            return response(second);
        });
        const reason = { en: "A factual note", zh: "真实推荐说明" };
        expect(await loadHomepageFeaturedTrails("https://database.example", [
            { id: firstID, reason }, { id: secondID }, { id: firstID },
        ])).toEqual([
            { trail: first, href: `/trail/view/@hiker/${firstID}`, reason },
            { trail: second, href: `/trail/view/@walker@mountains.example/${secondID}` },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("drops removed, private, anonymously denied, invalid and authorless entries", async () => {
        const ids = ["deletedtrail001", "privatetrail001", "deniedtrail0001", "noauthortrail01", "badremotetrail1"];
        fetchMock.mockImplementation(async (url) => {
            const id = new URL(String(url)).pathname.split("/").at(-1) ?? "";
            if (id === ids[0]) return response({ message: "not found" }, 404);
            if (id === ids[1]) return response(record(id, { public: false }));
            if (id === ids[2]) return response({ message: "forbidden" }, 403);
            if (id === ids[3]) return response(record(id, { expand: {} }));
            return response(record(id, { expand: { author: { preferred_username: "walker", is_local: false } } }));
        });
        expect(await loadHomepageFeaturedTrails("https://database.example", [
            ...ids.map((id) => ({ id })), { id: "not-an-id" },
        ])).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(ids.length);
    });

    it("distinguishes a backend failure from an empty list without leaking diagnostics", async () => {
        fetchMock.mockResolvedValue(response({ message: "private upstream details" }, 500));
        await expect(loadHomepageFeaturedTrails("https://database.example", [{ id: firstID }]))
            .rejects.toThrow("featured_trails_unavailable");
    });

    it("loads the persisted default selection before anonymously reading current records", async () => {
        const reason = { en: "A factual persisted note", zh: "持久化的真实推荐说明" };
        const paths: string[] = [];
        fetchMock.mockImplementation(async (url, options) => {
            const path = new URL(String(url)).pathname;
            paths.push(path);
            const headers = new Headers(options?.headers);
            expect(headers.has("Authorization")).toBe(false);
            expect(headers.has("Cookie")).toBe(false);
            if (path === "/homepage/featured") return response({ items: [{ id: secondID, reason }] });
            expect(path).toBe(`/api/collections/trails/records/${secondID}`);
            return response(record(secondID));
        });
        expect(await loadHomepageFeaturedTrails("https://database.example")).toEqual([
            { trail: record(secondID), href: `/trail/view/@hiker/${secondID}`, reason },
        ]);
        expect(paths).toEqual(["/homepage/featured", `/api/collections/trails/records/${secondID}`]);
    });

    it("treats missing or malformed persisted configuration as unavailable rather than empty", async () => {
        for (const fixture of [
            { body: { message: "private configuration backend details" }, status: 404 },
            { body: { items: "invalid configuration" }, status: 200 },
        ]) {
            fetchMock.mockResolvedValue(response(fixture.body, fixture.status));
            await expect(loadHomepageFeaturedTrails("https://database.example"))
                .rejects.toThrow("featured_trails_unavailable");
        }
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls.every(([url]) => new URL(String(url)).pathname === "/homepage/featured")).toBe(true);
    });

});
