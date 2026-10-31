<script lang="ts">
    import { browser } from "$app/environment";
    import { afterNavigate, goto } from "$app/navigation";
    import { page } from "$app/state";
    import LogoText from "$lib/components/logo/logo_text.svelte";
    import VoyageTrack from "$lib/components/logo/voyage_track.svelte";
    import { theme, toggleTheme } from "$lib/stores/theme_store";
    import { currentUser, logout } from "$lib/stores/user_store";
    import { getFileURL } from "$lib/util/file_util";
    import type { AuthRecord } from "pocketbase";
    import { _, locale } from "svelte-i18n";
    import { tick } from "svelte";
    import { backInOut, cubicOut } from "svelte/easing";
    import { Tween } from "svelte/motion";
    import Drawer from "./base/drawer.svelte";
    import Dropdown from "./base/dropdown.svelte";
    import LanguageSwitcher from "./language_switcher.svelte";
    import LogoTextLight from "./logo/logo_text_light.svelte";
    import NotificationDropdown from "./notification/notification_dropdown.svelte";
    import UrlImportModal from "./settings/url_import_modal.svelte";

    interface Props {
        user: AuthRecord;
        homeVariant?: boolean;
        homepageEditorUserID?: string | null;
    }

    let { user, homeVariant = false, homepageEditorUserID = null }: Props = $props();
    // `currentUser` is undefined until the client auth store has been
    // initialised. An explicit null means that the user logged out and must
    // not fall back to the (now stale) server-rendered prop.
    const navUser = $derived(
        $currentUser === undefined ? user : $currentUser,
    );

    const canManageHomepage = $derived(!!navUser && navUser.id === homepageEditorUserID);

    const navBarItems = $derived(homeVariant ? [
        { text: $_("home"), value: "/" },
        { text: $_("home-explore-nav"), value: "/trails" },
        { text: $_("map"), value: "/map" },
        { text: $_("about"), value: page.url.pathname === "/" ? "#about" : "/#about" },
    ] : [
        { text: $_("home"), value: "/" },
        { text: $_("trail", { values: { n: 2 } }), value: "/trails" },
        { text: $_("map"), value: "/map" },
        { text: $_("list", { values: { n: 2 } }), value: "/lists" },
    ]);

    const dropdownItems = $derived([
        { text: $_("user-center"), value: "dashboard", icon: "house-user" },
        { text: $_("profile"), value: "profile", icon: "user" },
        { text: $_("my-trails"), value: "trails", icon: "route" },

        ...(canManageHomepage ? [{ text: $_("featured-admin-title"), value: "featured-admin", icon: "star", href: "/admin/featured" }] : []),
        { text: $_("settings"), value: "settings", icon: "cog" },
        { text: $_("logout"), value: "logout", icon: "right-from-bracket" },
    ]);

    const importDropdownItems = $derived([
        { text: $_("from-file"), value: "file", icon: "file-import" },
        { text: $_("from-url"), value: "url", icon: "server" },
    ]);

    const indicatorPosition = new Tween(0, {
        duration: 300,
        easing: cubicOut,
    });

    const indicatorWidth = new Tween(0, {
        duration: 300,
        easing: cubicOut,
    });

    const indicatorScale = new Tween(0, {
        duration: 600,
        easing: backInOut,
    });

    let drawerOpen: boolean = $state(false);

    let urlImportModal: UrlImportModal;

    function updateIndicator(routeId: string | null | undefined) {
        if (!browser) return;
        if (homeVariant) {
            indicatorScale.set(0);
            return;
        }

        const navBarLinks = document.getElementById("nav-bar-links");
        let childPosition = -1;
        switch (routeId) {
            case "/":
                childPosition = 1;
                break;
            case "/trails":
                childPosition = 2;
                break;
            case "/map":
                childPosition = 3;
                break;
            case "/lists/[[handle]]/[[id]]":
                childPosition = 4;
                break;
            default:
                break;
        }

        if (childPosition !== -1) {
            const childElement = navBarLinks?.children[
                childPosition
            ];
            if (!(childElement instanceof HTMLElement)) {
                indicatorScale.set(0);
                return;
            }
            const newWidth = childElement.getBoundingClientRect().width;
            const newPosition = childElement.offsetLeft;
            const padding = 16;
            indicatorScale.set(1);
            indicatorWidth.set(newWidth + padding);
            indicatorPosition.set(newPosition - padding / 2);
        } else {
            indicatorScale.set(0);
        }
    }

    afterNavigate((e) => updateIndicator(e.to?.route.id));

    $effect(() => {
        if ($locale && browser) {
            // Translation changes resize the links without triggering navigation.
            void tick().then(() => updateIndicator(page.route.id));
        }
    });

    function handleLogout() {
        drawerOpen = false;
        void logout();
        window.location.assign("/");
    }

    function handleDropdownClick(item: { text: string; value: any }) {
        if (item.value == "profile") {
            if (navUser) goto(`/profile/@${navUser.username.toLowerCase()}`);
        } else if (item.value == "trails" || item.value == "dashboard") {
            goto("/dashboard");
        } else if (item.value == "featured-admin") {
            goto("/admin/featured");
        } else if (item.value == "logout") {
            handleLogout();
        } else if (item.value == "settings") {
            goto("/settings/profile");
        }
    }

    function handleImportDropdownClick(item: { text: string; value: any }) {
        if (item.value == "file") {
            goto(`/settings/export`);
        } else if (item.value == "url") {
            urlImportModal.openModal();
        }
    }
</script>

<Drawer bind:open={drawerOpen}>
    <div class="flex gap-4 items-center m-4">
        <div class="basis-full"></div>
        <button
            aria-label={$_("toggle-theme")}
            class="btn-icon fa-regular fa-{$theme === 'light' ? 'sun' : 'moon'}"
            onclick={() => toggleTheme()}
        ></button>
        <button
            aria-label={$_("toggle-navigation")}
            class="btn-icon block fa fa-close float-right"
            onclick={() => (drawerOpen = false)}
        ></button>
    </div>
    <div class="flex flex-col px-8 gap-4">
        {#each navBarItems as item}
            <a
                class={homeVariant ? "font-medium text-base py-2" : "font-semibold text-xl"}
                href={item.value}
                onclick={() => { if (homeVariant) drawerOpen = false; }}
            >{item.text}</a>
        {/each}
        {#if navUser}
            <a class="font-semibold text-xl" href="/dashboard" aria-current={page.url.pathname === "/dashboard" ? "page" : undefined}>
                {$_("user-center")}
            </a>
            {#if canManageHomepage}
                <a class="font-semibold text-xl" href="/admin/featured" onclick={() => { drawerOpen = false; }} aria-current={page.url.pathname === "/admin/featured" ? "page" : undefined}>
                    {$_("featured-admin-title")}
                </a>
            {/if}
        {/if}
    </div>
    <hr class="my-6 border-input-border" />
    <div class="flex flex-col basis-full">
        {#if navUser}
            <a class="btn-primary text-center mx-4" href="/trail/edit/new"
                ><i class="fa fa-plus mr-2"></i>{$_("new-trail")}</a
            >
            <div class="basis-full"></div>
            <hr class="border-input-border" />
            <div class="flex gap-4 items-center justify-between m-4">
                <a
                    class="shrink-0"
                    href="/profile/@{navUser.username.toLowerCase()}"
                >
                    <img
                        class="rounded-full w-10 aspect-square"
                        src={getFileURL(navUser, navUser.avatar, "100x100") ||
                            `https://api.dicebear.com/7.x/initials/svg?seed=${navUser.username.toLowerCase()}&backgroundType=gradientLinear`}
                        alt={$_("avatar")}
                    />
                </a>
                <a
                    href="/profile/@{navUser.username.toLowerCase()}"
                    style="width: calc(100% - 104px)"
                >
                    <p class="text-sm overflow-hidden text-ellipsis">
                        {navUser.username}
                    </p>
                    <p
                        class="text-sm text-gray-500 overflow-hidden text-ellipsis"
                    >
                        {navUser.email}
                    </p>
                </a>
                <button
                    aria-label={$_("logout")}
                    onclick={handleLogout}
                    class="btn-icon"
                    ><i class="fa-solid fa-arrow-right-from-bracket"
                    ></i></button
                >
            </div>
        {:else}
            <a class="btn-primary btn-large text-center mx-4" href="/login"
                >{homeVariant ? $_("home-login-register") : $_("login")}</a
            >
        {/if}
    </div>
</Drawer>

<nav
    data-app-header
    class:home-nav={homeVariant}
    style="height: var(--app-header-height)"
    class="flex justify-between items-center gap-2 px-4 py-2 sm:px-6 {page.url.pathname === '/'
        ? 'sticky top-0 z-10 bg-background'
        : ''}"
>
    <a
        href="/"
        class="min-w-0 w-32 sm:w-40 sm:shrink-0 [&>svg]:w-full [&>svg]:h-auto"
        aria-label={homeVariant ? "VoyageTrack" : undefined}
    >
        {#if homeVariant}
            <VoyageTrack />
        {:else if $theme == "light"}
            <LogoText></LogoText>
        {:else}
            <LogoTextLight></LogoTextLight>
        {/if}
    </a>
    <menu id="nav-bar-links" class="hidden lg:flex gap-4 xl:gap-8 relative py-1 px-2">
        {#if !homeVariant}
            <div
                class="absolute h-full w-16 bg-menu-item-background-hover rounded-xl top-0 z-0"
                style="width: {indicatorWidth.current}px; left: {indicatorPosition.current}px; scale: {indicatorScale.current}"
            ></div>
        {/if}
        {#each navBarItems as item}
            <a
                class={homeVariant ? "home-nav-link font-medium z-10" : "font-semibold z-10"}
                href={item.value}
                aria-current={homeVariant && item.value === "/" ? "page" : undefined}
            >{item.text}</a>
        {/each}
    </menu>
    <div class="flex shrink-0 items-center gap-2 lg:gap-4">
        <LanguageSwitcher />
        {#if navUser}
            <div class="hidden lg:flex gap-3 xl:gap-6 items-center">
                <button
                    aria-label={$_("toggle-theme")}
                    class="btn-icon fa-regular fa-{$theme === 'light'
                        ? 'sun'
                        : 'moon'}"
                    onclick={() => toggleTheme()}
                ></button>
                <nav data-sveltekit-reload>
                    <div class="flex">
                        <a
                            class="btn-primary btn-large !rounded-r-none focus:ring-0"
                            href="/trail/edit/new"
                            ><i class="fa fa-plus mr-2"></i>{$_("new-trail")}</a
                        >
                        <Dropdown
                            items={importDropdownItems}
                            onchange={(item) => handleImportDropdownClick(item)}
                        >
                            {#snippet children({ toggleMenu: openDropdown })}
                                <button
                                    onclick={openDropdown}
                                    class="bg-primary rounded-r-lg text-white min-h-11 sm:min-h-10 hover:bg-primary-hover px-3"
                                    class:home-primary-split={homeVariant}
                                    aria-label={$_("open-trail-create-menu")}
                                    ><i class="fa fa-caret-down"></i></button
                                >
                            {/snippet}
                        </Dropdown>
                    </div>
                </nav>
                {#if page.data.notifications}
                    <NotificationDropdown></NotificationDropdown>
                {/if}
                <Dropdown
                    items={dropdownItems}
                    onchange={(item) => handleDropdownClick(item)}
                >
                    {#snippet children({ toggleMenu: openDropdown })}
                        <div class="flex items-center">
                            <button
                                aria-label={$_("open-user-menu")}
                                class="rounded-full bg-white text-black hover:bg-gray-200 focus:ring-4 ring-gray-100/50 transition-colors h-10 aspect-square"
                                onclick={openDropdown}
                            >
                                <img
                                    class="rounded-full w-full h-full"
                                    src={getFileURL(navUser, navUser.avatar, "100x100") ||
                                        `https://api.dicebear.com/7.x/initials/svg?seed=${navUser.username.toLowerCase()}&backgroundType=gradientLinear`}
                                    alt={$_("avatar")}
                                />
                            </button>
                        </div>
                    {/snippet}
                </Dropdown>
            </div>
        {:else}
            <div class="hidden md:flex items-center gap-8">
                <button
                    aria-label={$_("toggle-theme")}
                    class="btn-icon fa-regular fa-{$theme === 'light'
                        ? 'sun'
                        : 'moon'}"
                    onclick={() => toggleTheme()}
                ></button>
                <a class="btn-primary btn-large" href="/login">{homeVariant ? $_("home-login-register") : $_("login")}</a>
            </div>
        {/if}
        <button
            aria-label={$_("toggle-navigation")}
            class="btn-icon fa fa-bars !h-11 shrink-0 lg:hidden"
            onclick={() => (drawerOpen = !drawerOpen)}
        ></button>
    </div>
</nav>

<UrlImportModal bind:this={urlImportModal}></UrlImportModal>

<style>
    .home-nav {
        max-width: 80rem;
        margin-inline: auto;
        padding-inline: 1rem;
        font-size: var(--text-sm);
    }
    .home-nav :global(.home-primary-split) {
        color: rgb(var(--content-inverse));
    }
    .home-nav-link {
        display: inline-flex;
        min-height: 2.5rem;
        align-items: center;
        white-space: nowrap;
        text-underline-offset: 0.4rem;
    }
    .home-nav-link:hover,
    .home-nav-link[aria-current="page"] {
        text-decoration: underline;
    }
    @media (min-width: 40rem) {
        .home-nav { padding-inline: 2rem; }
    }
    @media (min-width: 64rem) {
        .home-nav {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            gap: 1rem;
        }
        .home-nav #nav-bar-links {
            justify-self: center;
            gap: 1rem;
            padding-inline: 0;
        }
        .home-nav > a { width: 10rem; }
        .home-nav :global(.btn-large) { font-size: var(--text-sm); }
    }
</style>
