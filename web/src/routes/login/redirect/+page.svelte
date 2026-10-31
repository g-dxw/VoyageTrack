<script lang="ts">
    import { replaceState } from "$app/navigation";
    import { page } from "$app/state";
    import { oauth_login } from "$lib/stores/user_store";
    import { consumeOAuthCallback, type OAuthCallbackErrorKey } from "$lib/util/oauth_callback";
    import { onMount, tick } from "svelte";
    import { _ } from "svelte-i18n";

    let errorKey = $state<OAuthCallbackErrorKey | null>(null);

    async function completeLogin() {
        const params = new URLSearchParams(page.url.searchParams);
        // SvelteKit assigns its router root after the initial mount completes;
        // replaceState updates that root and cannot run synchronously in onMount.
        await tick();
        // Scrub the URL even when browser storage is blocked.
        replaceState(page.url.pathname, page.state);
        let result;
        try {
            result = consumeOAuthCallback(params, sessionStorage);
        } catch {
            // Accessing sessionStorage itself can fail in restricted browsers.
            errorKey = "oauth-storage-unavailable";
            return;
        }

        if (!result.ok) {
            errorKey = result.errorKey;
            return;
        }

        try {
            await oauth_login(result.data);
            window.location.replace("/");
        } catch {
            // Never log the full OAuth error, authorization code or tokens.
            errorKey = "error-during-login";
        }
    }

    onMount(() => {
        void completeLogin();
    });
</script>

<svelte:head>
    <title>{$_("login")} | wanderer</title>
</svelte:head>

<main
    class="flex items-center justify-center"
    style="min-height: calc(100vh - 388px)"
>
    {#if errorKey}
        <div
            role="alert"
            class="rounded-xl bg-input-background-error border border-red-400 m-4 p-5 sm:p-6 max-w-xl space-y-4"
        >
            <h5 class="text-xl font-semibold">{$_("error-during-login")}</h5>
            <p>{$_(errorKey)}</p>
            <a class="btn-secondary inline-flex justify-center" href="/login">{$_("oauth-back-to-login")}</a>
        </div>
    {:else}
        <div role="status" class="max-w-fit space-y-4 text-center">
            <div aria-hidden="true" class="spinner spinner-dark"></div>
            <h5 class="text-xl font-semibold">{$_("authenticating")}</h5>
        </div>
    {/if}
</main>
