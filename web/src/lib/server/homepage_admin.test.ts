import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PocketBase from "pocketbase";
import { HomepageFeaturedConfigSchema } from "$lib/models/api/homepage_featured_schema";
import { GET as getConfig, PUT as putConfig } from "../../routes/api/v1/admin/featured/+server";
import { GET as getCandidates } from "../../routes/api/v1/admin/featured/candidates/+server";
import { load as loadAdminPage } from "../../routes/admin/featured/+page.server";

const databaseURL = "https://database.example";
const origin = "https://voyagetrack.example";
const userID = "user00000000001";
const firstID = "firsttrail00001";
const reason = { en: "A factual note", zh: "真实推荐说明" };
const validConfig = { revision: 3, items: [{ id: firstID, reason }] };
// This unsigned, short-lived token exists only in these unit fixtures. The real
// SDK uses its expiry to exercise the authenticated-vs-anonymous client split.
const userToken = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.unit-test-signature`;

function response(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function record(id = firstID, extra: Record<string, unknown> = {}) {
    return {
        id, collectionId: "trails", collectionName: "trails", name: "Actual public route",
        public: true, author: "actor0000000001", photos: ["route.webp"], tags: [],
        expand: { author: { preferred_username: "hiker", is_local: true } },
        ...extra,
    };
}

function eventFor(options: { authenticated?: boolean; path?: string; method?: "GET" | "PUT"; body?: unknown; requestOrigin?: string } = {}) {
    const pb = new PocketBase(databaseURL);
    const profile = {
        id: userID, collectionId: "users", collectionName: "users", username: "hiker",
        actor: "actor0000000001", admin: true, role: "admin",
    };
    if (options.authenticated !== false) pb.authStore.save(userToken, profile);
    const url = new URL(options.path ?? "/api/v1/admin/featured", origin);
    const method = options.method ?? "PUT";
    const request = new Request(url, {
        method,
        headers: { "Content-Type": "application/json", Origin: options.requestOrigin ?? origin },
        ...(method === "PUT" ? { body: JSON.stringify(options.body ?? validConfig) } : {}),
    });
    return {
        url, request, locals: { pb, user: options.authenticated === false ? null : profile },
        setHeaders: vi.fn(),
    } as unknown as Parameters<typeof putConfig>[0];
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe("homepage editor server boundary with the real PocketBase SDK", () => {
    it.each(["anonymous", "mismatched", "expired"])("rejects %s identities before making backend requests", async identity => {
        const event = eventFor({ authenticated: identity !== "anonymous" });
        if (identity === "mismatched") event.locals.user = { ...event.locals.user, id: "differentuser01" };
        if (identity === "expired") event.locals.pb.authStore.save("expired-token", event.locals.pb.authStore.record);
        const result = await putConfig(event);
        expect(result.status).toBe(401);
        expect(await result.json()).toEqual({ message: "homepage_auth_required" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("ignores profile admin claims and requires the backend editor capability", async () => {
        const event = eventFor({ method: "GET" });
        fetchMock.mockImplementation(async (url, options) => {
            expect(new URL(String(url)).pathname).toBe("/homepage/editor");
            expect(new Headers(options?.headers).get("Authorization")).toBe(userToken);
            return response({ canManageHomepage: false });
        });
        const result = await getConfig(event);
        expect(result.status).toBe(403);
        expect(await result.json()).toEqual({ message: "homepage_editor_required" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("rejects a cross-origin mutation without forwarding a write", async () => {
        fetchMock.mockResolvedValue(response({ canManageHomepage: true }));
        const result = await putConfig(eventFor({ requestOrigin: "https://another.example" }));
        expect(result.status).toBe(403);
        expect(await result.json()).toEqual({ message: "homepage_invalid_origin" });
        expect(fetchMock.mock.calls.every(([, options]) => options?.method !== "PUT")).toBe(true);
    });

    it.each([
        { name: "duplicate trail", body: { revision: 3, items: [{ id: firstID }, { id: firstID }] } },
        { name: "unknown field", body: { ...validConfig, force: true } },
        { name: "unsafe revision", body: { ...validConfig, revision: Number.MAX_SAFE_INTEGER + 1 } },
        { name: "overlong reason", body: { revision: 3, items: [{ id: firstID, reason: { en: "x".repeat(241), zh: "" } }] } },
    ])("does not forward an invalid $name payload", async ({ body }) => {
        fetchMock.mockResolvedValue(response({ canManageHomepage: true }));
        const result = await putConfig(eventFor({ body }));
        expect(result.status).toBe(400);
        expect(await result.json()).toEqual({ message: "homepage_invalid_request" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
    });

    it("reads anonymous metadata before one authenticated commit and makes no post-commit reads", async () => {
        const order: string[] = [];
        fetchMock.mockImplementation(async (url, options) => {
            const requestURL = new URL(String(url));
            const headers = new Headers(options?.headers);
            if (requestURL.pathname === "/homepage/editor") {
                order.push("permission");
                expect(headers.get("Authorization")).toBe(userToken);
                return response({ canManageHomepage: true });
            }
            if (requestURL.pathname === "/homepage/admin/featured") {
                order.push("commit");
                expect(options?.method).toBe("PUT");
                expect(headers.get("Authorization")).toBe(userToken);
                expect(JSON.parse(String(options?.body))).toEqual(validConfig);
                return response({ ...validConfig, revision: 4 });
            }
            order.push("metadata");
            expect(requestURL.pathname).toBe(`/api/collections/trails/records/${firstID}`);
            expect(headers.has("Authorization")).toBe(false);
            expect(headers.has("Cookie")).toBe(false);
            return response(record());
        });
        const result = await putConfig(eventFor());
        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({
            revision: 4,
            items: [{ id: firstID, reason, featured: { trail: record(), href: `/trail/view/@hiker/${firstID}`, reason } }],
        });
        expect(result.headers.get("cache-control")).toBe("private, no-store");
        expect(result.headers.get("vary")).toBe("Cookie, Authorization");
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(order).toEqual(["permission", "metadata", "commit"]);
    });

    it("does not commit when metadata is unavailable, so the reported failure leaves saved configuration unchanged", async () => {
        let writes = 0;
        fetchMock.mockImplementation(async (url, options) => {
            const path = new URL(String(url)).pathname;
            if (path === "/homepage/editor") return response({ canManageHomepage: true });
            if (path === "/homepage/admin/featured" && options?.method === "PUT") {
                writes++;
                return response({ ...validConfig, revision: 4 });
            }
            expect(path).toBe(`/api/collections/trails/records/${firstID}`);
            return response({ message: "private metadata service diagnostics" }, 503);
        });
        const result = await putConfig(eventFor());
        expect(result.status).toBe(503);
        expect(await result.json()).toEqual({ message: "homepage_unavailable" });
        expect(writes).toBe(0);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("keeps revision conflicts stable and excludes backend diagnostics", async () => {
        fetchMock.mockImplementation(async (url) => {
            const path = new URL(String(url)).pathname;
            if (path === "/homepage/editor") return response({ canManageHomepage: true });
            if (path === `/api/collections/trails/records/${firstID}`) return response(record());
            return response({ message: "homepage_revision_conflict", data: { internal: "private backend diagnostics" }, revision: 91 }, 409);
        });
        const result = await putConfig(eventFor());
        expect(result.status).toBe(409);
        expect(await result.json()).toEqual({ message: "homepage_revision_conflict" });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("reports a permission-service outage as unavailable, not permission denied", async () => {
        fetchMock.mockResolvedValue(response({ message: "private upstream diagnostics", data: { detail: "private" } }, 500));
        const result = await getConfig(eventFor({ method: "GET" }));
        expect(result.status).toBe(503);
        expect(await result.json()).toEqual({ message: "homepage_unavailable" });
    });

    it("redirects an anonymous management page before any data request", async () => {
        const event = eventFor({ authenticated: false, method: "GET", path: "/admin/featured?page=2" });
        await expect(loadAdminPage(event as unknown as Parameters<typeof loadAdminPage>[0])).rejects.toMatchObject({
            status: 303, location: "/login?r=%2Fadmin%2Ffeatured%3Fpage%3D2",
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(event.setHeaders).toHaveBeenCalledWith(expect.objectContaining({ "cache-control": "private, no-store" }));
    });

    it("searches anonymous public candidates without personal filters and rechecks their ViewRule", async () => {
        const privateID = "privatetrail001";
        const deniedID = "deniedtrail0001";
        const unnamedID = "unnamedtrail001";
        const trails = [record(), record(privateID, { public: false }), record(deniedID), record(unnamedID, { name: "" })];
        fetchMock.mockImplementation(async (url, options) => {
            const requestURL = new URL(String(url));
            const headers = new Headers(options?.headers);
            if (requestURL.pathname === "/homepage/editor") return response({ canManageHomepage: true });
            expect(headers.has("Authorization")).toBe(false);
            expect(headers.has("Cookie")).toBe(false);
            if (requestURL.pathname === "/api/collections/trails/records") {
                const filter = requestURL.searchParams.get("filter") ?? "";
                expect(filter).toContain("public = true");
                expect(filter).toContain("name != ''");
                expect(filter).toContain("name ~");
                expect(filter).toContain("Actual");
                expect(filter).not.toMatch(/author|category|preference/);
                expect(requestURL.searchParams.get("page")).toBe("2");
                expect(requestURL.searchParams.get("perPage")).toBe("20");
                return response({ items: trails, page: 2, perPage: 20, totalPages: 2, totalItems: 24 });
            }
            const id = requestURL.pathname.split("/").at(-1);
            if (id === deniedID) return response({ message: "not allowed by anonymous ViewRule" }, 403);
            const current = trails.find(trail => trail.id === id);
            if (!current) throw new Error("Unexpected request");
            return response(current);
        });
        const event = eventFor({ method: "GET", path: "/api/v1/admin/featured/candidates?q=Actual&page=2&author=another&category=hidden" });
        const result = await getCandidates(event as unknown as Parameters<typeof getCandidates>[0]);
        expect(result.status).toBe(200);
        expect(await result.json()).toMatchObject({ page: 2, items: [{ trail: record(), href: `/trail/view/@hiker/${firstID}` }] });
        // Four record reads follow the permission request and anonymous list.
        expect(fetchMock).toHaveBeenCalledTimes(6);
    });
});

describe("homepage configuration input contract", () => {
    it("counts Unicode characters and accepts exactly 240 characters per reason", () => {
        const payload = { revision: 0, items: [{ id: firstID, reason: { en: "🧭".repeat(240), zh: "山".repeat(240) } }] };
        expect(HomepageFeaturedConfigSchema.safeParse(payload).success).toBe(true);
        expect(HomepageFeaturedConfigSchema.safeParse({ ...payload, items: [{ id: firstID, reason: { ...payload.items[0].reason, en: "🧭".repeat(241) } }] }).success).toBe(false);
    });

    it("rejects unknown fields at every level and unsafe revisions", () => {
        for (const invalid of [
            { ...validConfig, admin: true },
            { ...validConfig, items: [{ ...validConfig.items[0], featured: record() }] },
            { ...validConfig, items: [{ id: firstID, reason: { ...reason, language: "extra" } }] },
            ...[-1, .5, Number.MAX_SAFE_INTEGER + 1, Infinity].map(revision => ({ ...validConfig, revision })),
        ]) {
            expect(HomepageFeaturedConfigSchema.safeParse(invalid).success).toBe(false);
        }
    });
});
