import type { RequestEvent } from "@sveltejs/kit";
import PocketBase from "pocketbase";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./+server";

vi.mock("$env/dynamic/private", () => ({ env: { ORIGIN: "http://localhost:5173" } }));

function requestEvent(body: unknown, backendResponse = Response.json({ token: "pb-token", record: { id: "user1" } })) {
    const pb = new PocketBase("https://pocketbase.test");
    const backendFetch = vi.fn(async () => backendResponse);
    vi.stubGlobal("fetch", backendFetch);
    return {
        pb, backendFetch,
        event: {
            request: new Request("http://localhost:5173/api/v1/auth/oauth", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            }),
            locals: { pb },
        } as unknown as RequestEvent,
    };
}

const payload = { name: "oidc", code: "synthetic-code", codeVerifier: "synthetic-verifier" };

afterEach(() => { vi.unstubAllGlobals(); });

describe("Web OAuth proxy", () => {
    it("returns only PB token/record, retains the native auth store and accepts a record without email", async () => {
        const record = { id: "user1", username: "ordinary-user", collectionName: "users", email: "" };
        const { event, pb, backendFetch } = requestEvent(payload, Response.json({
            token: "pb-token", record,
            meta: { accessToken: "upstream-access-token", refreshToken: "upstream-refresh-token", rawUser: { sub: "idp-subject" } },
        }));
        const response = await POST(event);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ token: "pb-token", record });
        expect(pb.authStore.token).toBe("pb-token");
        expect(pb.authStore.record).toEqual(record);
        expect(backendFetch).toHaveBeenCalledOnce();
        const [url, options] = backendFetch.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://pocketbase.test/api/collections/users/auth-with-oauth2");
        expect(JSON.parse(String(options.body))).toEqual({
            provider: "oidc", code: "synthetic-code", codeVerifier: "synthetic-verifier",
            redirectURL: "http://localhost:5173/login/redirect",
        });
    });

    it.each([
        {}, { ...payload, name: "" }, { ...payload, code: "" },
        { ...payload, codeVerifier: "" }, { ...payload, code: 123 },
    ])("rejects invalid parameters before contacting PB", async body => {
        const { event, backendFetch } = requestEvent(body);
        const response = await POST(event);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ message: "invalid_params" });
        expect(backendFetch).not.toHaveBeenCalled();
    });

    it("handles malformed JSON without reflecting the request", async () => {
        const { event, backendFetch } = requestEvent(payload);
        event.request = new Request(event.request.url, { method: "POST", body: "{synthetic-code" });
        const response = await POST(event);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ message: "invalid_params" });
        expect(backendFetch).not.toHaveBeenCalled();
    });

    it.each([400, 401, 403, 429, 500])("sanitizes backend errors (HTTP %s)", async status => {
        const { event } = requestEvent(payload, Response.json({
            message: "invalid_grant: synthetic-code", data: { accessToken: "upstream-token" },
        }, { status }));
        const response = await POST(event);
        expect(response.status).toBe(status < 500 ? status : 502);
        expect(await response.json()).toEqual({ message: "oauth_authentication_failed" });
    });

    it("sanitizes unexpected exchange errors", async () => {
        const { event, backendFetch } = requestEvent(payload);
        backendFetch.mockRejectedValue(new Error("upstream-token synthetic-code"));
        const response = await POST(event);
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ message: "oauth_authentication_failed" });
    });
});
