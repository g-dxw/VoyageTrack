<script lang="ts">
    import {
        beforeNavigate,
        goto,
        invalidateAll,
    } from "$app/navigation";

    import { page } from "$app/state";
    import { env } from "$env/dynamic/public";
    import Toast from "$lib/components/base/toast.svelte";
    import Footer from "$lib/components/footer.svelte";
    import NavBar from "$lib/components/nav_bar.svelte";
    import PageLoadingBar from "$lib/components/page_loading_bar.svelte";
    import UploadDialog from "$lib/components/settings/upload_dialog.svelte";
    import { getPb } from "$lib/pocketbase";
    import { currentUser } from "$lib/stores/user_store";
    import { load_plugin_data_once } from "$lib/stores/plugin_store";
    import { show_toast } from "$lib/stores/toast_store.svelte";
    import { isRouteProtected } from "$lib/util/authorization_util";
    import { onMount, type Snippet } from "svelte";
    import { slide } from "svelte/transition";
    import { _, locale } from "svelte-i18n";
    import "../css/app.css";
    import "../css/components.css";
    import "../css/theme.css";
    import type { LayoutData } from "./$types";

    interface Props {
        data: LayoutData;
        children?: Snippet;
    }

    let { data, children }: Props = $props();
    const isHomepage = $derived(page.url.pathname === "/");
    const usePlatformChrome = $derived(isHomepage || page.url.pathname.startsWith("/admin/"));

    $effect(() => {
        document.documentElement.lang = $locale === "zh" ? "zh-CN" : ($locale ?? "en");
    });

    beforeNavigate((n) => {
        if (!$currentUser && isRouteProtected(n.to?.url)) {
            n.cancel();
            goto("/login?r=" + n.to?.url?.pathname);
        }
    });

    onMount(() => {
        try {
            const settingsSaveFailed = sessionStorage.getItem("registration-settings-save-failed");
            sessionStorage.removeItem("registration-settings-save-failed");
            if (settingsSaveFailed === "1") {
                show_toast({ icon: "close", type: "error", text: $_("error-saving-settings") });
            }
        } catch {
            // The notice is optional when browser storage is disabled.
        }
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(location.origin);
        if (page.data.origin != location.origin && !isLocalhost) {
            showWarning = true;
        }
        if (data.user) {
            load_plugin_data_once();
        }
    });

    type AuthIdentity = string | null;

    interface ClientAuthSession {
        identity: AuthIdentity;
        key: string;
    }

    // This is deliberately not reactive. It is a guard against scheduling the
    // same invalidation again when SvelteKit replaces `data` after a load but
    // the server still rejects the client's auth identity.
    let lastRequestedAuthSessionKey: string | undefined;
    let queuedAuthSession: ClientAuthSession | undefined;
    let authRefreshInFlight: Promise<void> | undefined;

    function clientAuthSession(): ClientAuthSession | undefined {
        if ($currentUser === undefined) {
            return undefined;
        }

        const identity = $currentUser?.id ?? null;
        return {
            identity,
            // Include the token so a same-user reauthentication cannot be
            // mistaken for the session whose request is currently in flight.
            key: `${identity ?? ""}\u0000${getPb().authStore.token}`,
        };
    }

    function serverAuthIdentity(): AuthIdentity {
        return data.user?.id ?? null;
    }

    async function runAuthRefreshQueue() {
        while (queuedAuthSession !== undefined) {
            const expectedClientSession = queuedAuthSession;
            queuedAuthSession = undefined;

            try {
                await invalidateAll();
            } catch {
                // A later auth or data change may retry a failed load.
                if (
                    clientAuthSession()?.key === expectedClientSession.key &&
                    lastRequestedAuthSessionKey === expectedClientSession.key
                ) {
                    lastRequestedAuthSessionKey = undefined;
                }
                continue;
            }

            const currentClientSession = clientAuthSession();
            const pb = getPb();
            if (currentClientSession?.key === expectedClientSession.key) {
                // The server refresh may rotate the token even when the user ID
                // stays the same. Keep LocalAuthStore aligned with the response
                // cookie, including when the server rejected and cleared it.
                pb.authStore.loadFromCookie(document.cookie);
            } else if (currentClientSession) {
                // A newer login/logout won the race. The older HTTP response may
                // already have overwritten its cookie, so restore the current
                // client session instead of importing the stale response.
                document.cookie = pb.authStore.exportToCookie({
                    httpOnly: false,
                    secure: location.protocol === "https:",
                    sameSite: "Lax",
                });
            }
        }
    }

    function requestAuthRefresh(session: ClientAuthSession): Promise<void> {
        // Keep at most one invalidation in flight. If auth changes during it,
        // the queue performs one follow-up load for the latest session.
        queuedAuthSession = session;
        if (!authRefreshInFlight) {
            authRefreshInFlight = runAuthRefreshQueue().finally(() => {
                authRefreshInFlight = undefined;
                if (queuedAuthSession !== undefined) {
                    void requestAuthRefresh(queuedAuthSession);
                }
            });
        }
        return authRefreshInFlight;
    }

    // PocketBase propagates auth changes between tabs through localStorage.
    // Keep server-loaded data aligned with the client auth identity.
    $effect(() => {
        const clientSession = clientAuthSession();
        if (clientSession === undefined) {
            return;
        }

        if (clientSession.identity === serverAuthIdentity()) {
            lastRequestedAuthSessionKey = undefined;
            return;
        }

        if (clientSession.key !== lastRequestedAuthSessionKey) {
            lastRequestedAuthSessionKey = clientSession.key;
            void requestAuthRefresh(clientSession);
        }
    });

    async function handlePageShow(event: PageTransitionEvent) {
        if (!event.persisted) {
            return;
        }

        // A page restored from the browser's back-forward cache keeps its old
        // JavaScript state. Reload auth from the current cookie before
        // invalidating all server data so private records cannot survive a
        // login/logout that happened while the page was cached.
        const pb = getPb();
        pb.authStore.loadFromCookie(document.cookie);

        const restoredSession = clientAuthSession();
        if (!restoredSession) {
            return;
        }
        lastRequestedAuthSessionKey = restoredSession.key;
        await requestAuthRefresh(restoredSession);
    }

    let hideDemoHint = $state(false);
    let showWarning = $state(false);
</script>

<svelte:window onpageshow={handlePageShow} />

{#if env.PUBLIC_IS_DEMO === "true" && !hideDemoHint}
    <div
        class="flex items-center justify-between bg-amber-200 text-center p-4 text-sm text-black"
        out:slide
    >
        <div></div>
        <span>{$_("demo-instance-hint")}</span>
        <button
            aria-label={$_("close")}
            class="btn-icon self-end"
            onclick={() => (hideDemoHint = true)}
            ><i class="fa fa-close"></i></button
        >
    </div>
{/if}

{#if showWarning}
    <div
        class="flex items-center justify-between bg-red-200 text-center p-4 text-sm text-black"
        out:slide
    >
        <div></div>
        <p>
            {$_("origin-warning-current")} <span class="font-mono bg-gray-100"
                >{location.origin}</span
            >
            {$_("origin-warning-configured")}
            <span class="font-mono bg-gray-100">{page.data.origin}</span>{$_("origin-warning-consequence")}
        </p>
        <button
            aria-label={$_("close")}
            class="btn-icon self-end"
            onclick={() => (showWarning = false)}
            ><i class="fa fa-close"></i></button
        >
    </div>
{/if}

<div class:homepage-shell={usePlatformChrome}>
    <NavBar user={data.user} homeVariant={usePlatformChrome} homepageEditorUserID={data.homepageEditorUserID}></NavBar>
    <PageLoadingBar class="text-content"></PageLoadingBar>
    <Toast></Toast>
    <UploadDialog></UploadDialog>
    {@render children?.()}
    <Footer homeVariant={usePlatformChrome}></Footer>
</div>

<style>
    .homepage-shell {
        /* Tailwind's theme aliases otherwise inherit values already resolved
           against the global palette. Resolve them again inside this scope. */
        --color-primary: rgba(var(--primary));
        --color-primary-hover: rgba(var(--primary-hover));
        --color-secondary-hover: rgba(var(--secondary-hover));
        --color-background: rgba(var(--background));
        --color-background-inverse: rgba(var(--background-inverse));
        --color-content: rgba(var(--content));
        --color-content-inverse: rgba(var(--content-inverse));
        --color-input-background: rgba(var(--input-background));
        --color-input-background-error: rgba(var(--input-background-error));
        --color-input-border: rgba(var(--input-border));
        --color-input-border-focus: rgba(var(--input-border-focus));
        --color-input-ring: rgba(var(--input-ring));
        --color-toggle-active: rgba(var(--toggle-active));
        --color-menu-background: rgba(var(--menu-background));
        --color-menu-item-background-hover: rgba(var(--menu-item-background-hover));
        --color-menu-item-background-focus: rgba(var(--menu-item-background-focus));
        --color-footer-background: rgba(var(--footer-background));
        --color-separator: rgba(var(--separator));
        --primary: 0, 0, 0;
        --primary-hover: 38, 38, 38;
        --secondary-hover: 245, 245, 245;
        --secondary-hover-inverse: 23, 23, 23;
        --background: 255, 255, 255;
        --background-inverse: 0, 0, 0;
        --content: 23, 23, 23;
        --content-inverse: 255, 255, 255;
        --input-background: 250, 250, 250;
        --input-border: 212, 212, 212;
        --input-border-focus: 82, 82, 82;
        --input-ring: 163, 163, 163;
        --toggle-active: 38, 38, 38;
        --menu-background: 255, 255, 255;
        --menu-item-background-hover: 245, 245, 245;
        --menu-item-background-focus: 229, 229, 229;
        --footer-background: 255, 255, 255;
        --separator: 229, 229, 229;
        --tooltip-background: rgba(23, 23, 23, 0.9);
        --tooltip-color: #fff;
        min-height: 100svh;
        background: rgb(var(--background));
        color: rgb(var(--content));
    }
    :global(.dark) .homepage-shell {
        --primary: 255, 255, 255;
        --primary-hover: 229, 229, 229;
        --secondary-hover: 38, 38, 38;
        --secondary-hover-inverse: 245, 245, 245;
        --background: 0, 0, 0;
        --background-inverse: 255, 255, 255;
        --content: 245, 245, 245;
        --content-inverse: 0, 0, 0;
        --input-background: 23, 23, 23;
        --input-border: 64, 64, 64;
        --input-border-focus: 212, 212, 212;
        --input-ring: 115, 115, 115;
        --toggle-active: 212, 212, 212;
        --menu-background: 23, 23, 23;
        --menu-item-background-hover: 38, 38, 38;
        --menu-item-background-focus: 64, 64, 64;
        --footer-background: 0, 0, 0;
        --separator: 64, 64, 64;
        --tooltip-background: rgba(245, 245, 245, 0.95);
        --tooltip-color: #000;
    }
    .homepage-shell :global(.btn-primary:not(.btn-disabled)) {
        color: rgb(var(--content-inverse));
    }
</style>
