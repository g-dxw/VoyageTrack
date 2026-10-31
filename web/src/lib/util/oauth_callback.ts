import type { AuthProviderInfo } from "pocketbase";
import { z } from "zod";

export const OAUTH_PROVIDER_STORAGE_KEY = "wanderer_oauth_provider";

const providerSchema = z.object({
    name: z.string().min(1),
    state: z.string().min(1),
    codeVerifier: z.string().min(1),
});

export type OAuthCallbackErrorKey =
    | "oauth-invalid-callback"
    | "oauth-missing-provider"
    | "oauth-provider-mismatch"
    | "oauth-login-cancelled"
    | "oauth-storage-unavailable"
    | "error-during-login";

type OAuthCallbackResult =
    | { ok: true; data: { name: string; code: string; codeVerifier: string } }
    | { ok: false; errorKey: OAuthCallbackErrorKey };

export function saveOAuthProvider(storage: Pick<Storage, "setItem">, provider: AuthProviderInfo) {
    // Keep the PKCE transaction in this tab only, not in persistent storage.
    const { name, state, codeVerifier } = providerSchema.parse(provider);
    storage.setItem(OAUTH_PROVIDER_STORAGE_KEY, JSON.stringify({ name, state, codeVerifier }));
}

export function consumeOAuthCallback(
    params: URLSearchParams,
    storage: Pick<Storage, "getItem" | "removeItem">,
): OAuthCallbackResult {
    let saved: string | null;
    try {
        saved = storage.getItem(OAUTH_PROVIDER_STORAGE_KEY);
        // A callback attempt consumes the transaction, including cancellations
        // and malformed responses. Reloading cannot replay an authorization code.
        storage.removeItem(OAUTH_PROVIDER_STORAGE_KEY);
    } catch {
        return { ok: false, errorKey: "oauth-storage-unavailable" };
    }

    const state = params.get("state");
    if (!state || params.getAll("state").length !== 1) {
        return { ok: false, errorKey: "oauth-invalid-callback" };
    }
    if (!saved) return { ok: false, errorKey: "oauth-missing-provider" };

    let provider: z.infer<typeof providerSchema>;
    try {
        provider = providerSchema.parse(JSON.parse(saved));
    } catch {
        return { ok: false, errorKey: "oauth-missing-provider" };
    }
    if (provider.state !== state) {
        return { ok: false, errorKey: "oauth-provider-mismatch" };
    }

    if (params.has("error")) {
        return {
            ok: false,
            errorKey: params.get("error") === "access_denied"
                ? "oauth-login-cancelled"
                : "error-during-login",
        };
    }

    const code = params.get("code");
    if (!code || params.getAll("code").length !== 1) {
        return { ok: false, errorKey: "oauth-invalid-callback" };
    }

    return { ok: true, data: { name: provider.name, code, codeVerifier: provider.codeVerifier } };
}
