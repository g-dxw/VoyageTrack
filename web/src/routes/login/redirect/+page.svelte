<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import { oauth_login } from "$lib/stores/user_store";
    import type { AuthProviderInfo } from "pocketbase";
    import { onMount } from "svelte";
    import { _ } from "svelte-i18n";

    let error = $state(page.url.searchParams.get("error"));
    let errorDescription = $state(page.url.searchParams.get("error_description"));
    const errorURI = page.url.searchParams.get("error_uri");

    const oauthState = page.url.searchParams.get("state");
    const code = page.url.searchParams.get("code");
    onMount(async () => {
        if (error || !oauthState || !code) {
            return;
        }

        const providerData = localStorage.getItem("provider");

        if (!providerData) {
            error = "missing_provider";
            errorDescription = $_("oauth-missing-provider");
            return;
        }

        const provider: AuthProviderInfo = JSON.parse(providerData);

        if (provider.state !== oauthState) {
            error = "mismacthed_provider";
            errorDescription = $_("oauth-provider-mismatch");
            return;
        }

        oauth_login({
            name: provider.name,
            code: code,
            codeVerifier: provider.codeVerifier,
        })
            .then(() => {
                window.location.replace("/");
            })
            .catch((e) => {
                error = "oauth_error";
                console.error(e);
                errorDescription = $_("error-during-login");
            });
    });
</script>

<main
    class="flex items-center justify-center"
    style="min-height: calc(100vh - 388px)"
>
    {#if error}
        <div
            class="rounded-xl bg-input-background-error border border-red-400 p-6 max-w-xl space-y-4"
        >
            <h5 class="text-xl font-semibold">{$_("error-during-login")}</h5>
            <p>{errorDescription}</p>
            {#if errorURI}
                <p><a class="underline" href={errorURI}>{$_("more-info")}</a></p>
            {/if}
        </div>
    {:else}
        <div class="max-w-fit space-y-4 text-center">
            <div class="spinner spinner-dark"></div>
            <h5 class="text-xl font-semibold">{$_("authenticating")}</h5>
        </div>
    {/if}
</main>
