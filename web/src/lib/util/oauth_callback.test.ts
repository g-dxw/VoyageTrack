import type { AuthProviderInfo } from "pocketbase";
import { describe, expect, it, vi } from "vitest";
import {
    consumeOAuthCallback,
    OAUTH_PROVIDER_STORAGE_KEY,
    saveOAuthProvider,
} from "./oauth_callback";

const provider: AuthProviderInfo = {
    name: "oidc",
    displayName: "Logto",
    state: "test-state",
    authURL: "https://identity.test/auth?redirect_uri=",
    codeVerifier: "test-verifier",
    codeChallenge: "test-challenge",
    codeChallengeMethod: "S256",
};

function storageWith(value: string | null = JSON.stringify(provider)) {
    const values = new Map<string, string>();
    if (value !== null) values.set(OAUTH_PROVIDER_STORAGE_KEY, value);
    return {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, data: string) => { values.set(key, data); }),
        removeItem: vi.fn((key: string) => { values.delete(key); }),
    };
}

describe("single-use OAuth callback", () => {
    it("stores only the provider, state and verifier needed for the transaction", () => {
        const storage = storageWith(null);
        saveOAuthProvider(storage, provider);
        expect(JSON.parse(storage.getItem(OAUTH_PROVIDER_STORAGE_KEY)!)).toEqual({
            name: "oidc", state: "test-state", codeVerifier: "test-verifier",
        });
    });

    it("accepts the matching callback once and consumes its verifier", () => {
        const storage = storageWith();
        const params = new URLSearchParams("state=test-state&code=test-code");
        expect(consumeOAuthCallback(params, storage)).toEqual({
            ok: true, data: { name: "oidc", code: "test-code", codeVerifier: "test-verifier" },
        });
        expect(storage.getItem(OAUTH_PROVIDER_STORAGE_KEY)).toBeNull();
        expect(consumeOAuthCallback(params, storage)).toEqual({ ok: false, errorKey: "oauth-missing-provider" });
    });

    it.each([
        "", "code=test-code", "state=&code=test-code", "state=test-state",
        "state=test-state&code=", "state=test-state&state=test-state&code=test-code",
        "state=test-state&code=first&code=second",
    ])("rejects incomplete or ambiguous parameters (%s) and clears storage", query => {
        const storage = storageWith();
        expect(consumeOAuthCallback(new URLSearchParams(query), storage)).toEqual({
            ok: false, errorKey: "oauth-invalid-callback",
        });
        expect(storage.getItem(OAUTH_PROVIDER_STORAGE_KEY)).toBeNull();
    });

    it.each([null, "{bad json", "null", "[]", "{}", JSON.stringify({ ...provider, codeVerifier: 123 })])(
        "handles missing or malformed stored transactions without throwing",
        saved => {
            const storage = storageWith(saved);
            expect(consumeOAuthCallback(new URLSearchParams("state=test-state&code=test-code"), storage)).toEqual({
                ok: false, errorKey: "oauth-missing-provider",
            });
            expect(storage.getItem(OAUTH_PROVIDER_STORAGE_KEY)).toBeNull();
        },
    );

    it("checks state before accepting success or provider errors", () => {
        for (const suffix of ["code=test-code", "error=access_denied"]) {
            const storage = storageWith();
            expect(consumeOAuthCallback(new URLSearchParams(`state=wrong-state&${suffix}`), storage)).toEqual({
                ok: false, errorKey: "oauth-provider-mismatch",
            });
            expect(storage.getItem(OAUTH_PROVIDER_STORAGE_KEY)).toBeNull();
        }
    });

    it.each([
        ["access_denied", "oauth-login-cancelled"],
        ["server_error", "error-during-login"],
        ["untrusted error text", "error-during-login"],
    ])("maps provider error %s to a static message without relaying diagnostics", (error, errorKey) => {
        const storage = storageWith();
        const params = new URLSearchParams({
            state: "test-state", error,
            error_description: "sensitive code or token", error_uri: "javascript:alert(1)",
        });
        expect(consumeOAuthCallback(params, storage)).toEqual({ ok: false, errorKey });
        expect(storage.getItem(OAUTH_PROVIDER_STORAGE_KEY)).toBeNull();
    });

    it.each(["getItem", "removeItem"] as const)("handles unavailable browser storage (%s)", method => {
        const storage = storageWith();
        storage[method].mockImplementation(() => { throw new Error("storage unavailable"); });
        expect(consumeOAuthCallback(new URLSearchParams("state=test-state&code=test-code"), storage)).toEqual({
            ok: false, errorKey: "oauth-storage-unavailable",
        });
    });
});
