<script lang="ts">
    import { sanitizeHTML } from "$lib/util/sanitize_html";
    import { localizeAboutMarkdown } from "$lib/i18n/about";
    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import emptyStateTrailDark from "$lib/assets/svgs/empty_states/empty_state_trail_dark.svg";
    import emptyStateTrailLight from "$lib/assets/svgs/empty_states/empty_state_trail_light.svg";
    import Search, {
        type SearchItem,
    } from "$lib/components/base/search.svelte";
    import EmptyStateFeed from "$lib/components/empty_states/empty_state_feed.svelte";
    import FeedCard from "$lib/components/profile/feed_card.svelte";
    import Scene from "$lib/components/3D/scene.svelte";
    import TrailCard from "$lib/components/trail/trail_card.svelte";
    import {
        defaultTrailSearchAttributes,
        type TrailSearchResult,
    } from "$lib/models/trail.js";
    import { feed_index } from "$lib/stores/feed_store.js";
    import {
        searchActors,
        searchMulti,
        type ListSearchResult,
        type LocationSearchResult,
    } from "$lib/stores/search_store.js";
    import { theme } from "$lib/stores/theme_store";
    import { getIconForLocation } from "$lib/util/icon_util.js";
    import { Canvas } from "@threlte/core";
    import { marked } from "marked";
    import { onMount, untrack } from "svelte";
    import { _ } from "svelte-i18n";
    import StarSky from "$lib/components/3D/star_sky.svelte";
    import { fade } from "svelte/transition";

    let { data } = $props();

    let searchDropdownItems: SearchItem[] = $state([]);

    let feed = $state(untrack(() => data.feed));

    let pagination = $derived({
        page: feed.page,
        totalPages: feed.totalItems,
    });

    let loading: boolean = false;

    let aboutMarkdown = $state<string | null>(null);
    const about = $derived(marked.parse(
        localizeAboutMarkdown(aboutMarkdown, $_("about-content")),
        { async: false },
    ));

    onMount(async () => {
        try {
            const markdownResponse = await fetch("/md/about.md");
            if (markdownResponse.ok) {
                aboutMarkdown = await markdownResponse.text();
            }
        } catch (e) {
            console.warn(e);
        }
    });

    async function search(q: string) {
        if (q.startsWith("@")) {
            const actors = await searchActors(q);
            searchDropdownItems = actors.map((a) => ({
                text: a.username,
                description: `@${a.preferred_username}${a.is_local ? "" : "@" + a.domain}`,
                value: a,
                icon:
                    a.icon ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${a.preferred_username}&backgroundType=gradientLinear`,
            }));
        } else {
            const r = await searchMulti({
                queries: [
                    {
                        indexUid: "trails",
                        attributesToRetrieve: defaultTrailSearchAttributes,
                        q: q,
                        limit: 3,
                    },
                    {
                        indexUid: "lists",
                        q: q,
                        limit: 3,
                    },
                    {
                        indexUid: "locations",
                        q: q,
                        limit: 5,
                    },
                ],
            });
            const trailItems = r[0].hits.map((t: TrailSearchResult) => ({
                text: t.name,
                description: `${$_("trail", { values: { n: 1 } })}${t.location.length ? ", " + t.location : ""}`,
                value: `@${t.author_name}${t.domain ? `@${t.domain}` : ""}/${t.id}`,
                icon: "route",
            }));
            const listItems = r[1].hits.map((t: ListSearchResult) => ({
                text: t.name,
                description: `${$_("list", { values: { n: 1 } })}, ${t.trails} ${$_("trail", { values: { n: t.trails } })}`,
                value: `@${t.author_name}${t.domain ? `@${t.domain}` : ""}/${t.id}`,
                icon: "layer-group",
            }));
            const cityItems = r[2].hits.map((c: LocationSearchResult) => ({
                text: c.name,
                description: c.description,
                value: c,
                icon: getIconForLocation(c),
            }));

            searchDropdownItems = [...trailItems, ...listItems, ...cityItems];
        }
    }

    function handleSearchClick(item: SearchItem) {
        if (item.icon == "route") {
            goto(`/trail/view/${item.value}`);
        } else if (item.icon == "layer-group") {
            goto(`/lists/${item.value}`);
        } else if (item.value.preferred_username) {
            goto(
                `/profile/@${item.value.preferred_username}${item.value.is_local ? "" : "@" + item.value.domain}`,
            );
        } else {
            goto(`/map/?lat=${item.value.lat}&lon=${item.value.lon}`);
        }
    }

    async function onScroll(e: Event) {
        if (!page.data.user) {
            return;
        }
        if (
            window.innerHeight + window.scrollY >=
                0.8 * document.body.offsetHeight &&
            pagination.page !== pagination.totalPages &&
            !loading
        ) {
            loading = true;
            await loadNextPage();
            loading = false;
        }
    }

    async function loadNextPage() {
        pagination.page += 1;
        feed = await feed_index(pagination.page);
    }
</script>

<svelte:head>
    <title>{$_("home")} | wanderer</title>
</svelte:head>

<svelte:window onscroll={onScroll} />

<section
    class="hero grid grid-cols-1 lg:grid-cols-2 lg:px-8 gap-4 lg:gap-8"
>
    <div
        class="flex flex-col justify-center gap-5 px-5 py-8 lg:px-24 lg:py-10 mt-0 lg:sticky"
        style="top: var(--app-header-height)"
    >
        <h2 class="text-5xl sm:text-6xl lg:text-7xl font-bold">
            {$_("welcome_to")} <span class="-tracking-[0.075em]">wanderer</span>
        </h2>
        <h5>
            {$_("hero_section_0_text")}
        </h5>
        <Search
            onupdate={search}
            onclick={handleSearchClick}
            large={true}
            clearAfterSelect={false}
            placeholder="{$_('search-for-trails-places')}..."
            items={searchDropdownItems}
        ></Search>
    </div>
    {#if page.data.user}
        <div class="space-y-2">
            {#if feed.items.length === 0}
                <EmptyStateFeed></EmptyStateFeed>
            {/if}
            {#each feed.items as f}
                {#if f.expand?.item}
                    <FeedCard feedItem={f}></FeedCard>
                {/if}
            {/each}
        </div>
    {/if}
</section>
{#if !page.data.user}
    <div
        class="hidden lg:block w-full fixed -z-10"
        style="top: var(--app-header-height); min-height: calc(100dvh - var(--app-header-height))"
    >
        <div class="invisible dark:visible">
            <StarSky></StarSky>
        </div>
        <div class="absolute h-full w-[60%] left-[40%]">
            <Canvas toneMapping={0}>
                <Scene></Scene>
            </Canvas>
            {#if $theme === "light"}
                <enhanced:img
                    class="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 max-h-3/4"
                    src="/static/models/wanderer_diorama_light.png"
                    alt={$_("wanderer-diorama")}
                />
            {:else}
                <enhanced:img
                    class="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 max-h-3/4"
                    src="/static/models/wanderer_diorama_dark.png"
                    alt={$_("wanderer-diorama")}
                />
            {/if}
        </div>
    </div>
    <section class="lg:px-8 lg:max-w-1/2 mb-12 lg:mb-16" id="about">
        <div class="px-5 lg:px-24">
            <h2 class="text-4xl lg:text-5xl font-bold mt-1 mb-4">
                {$_("about")}
            </h2>
            <div class="prose dark:prose-invert">
                {@html sanitizeHTML(about)}
            </div>
        </div>
    </section>
    <section class="lg:px-8 lg:max-w-1/2 mb-12 lg:mb-16" id="trails">
        <div class="px-5 lg:px-24 space-y-3">
            <h2 class="text-4xl lg:text-5xl font-bold">
                {$_("explore-some-trails")}
            </h2>
            <h5>
                {$_("hero_section_1_text")}
            </h5>
            {#if data.trails.length == 0}
                <img
                    style="width: min(450px, 100%)"
                    class="rounded-md"
                    src={$theme === "light"
                        ? emptyStateTrailLight
                        : emptyStateTrailDark}
                    alt={$_("empty-trails-illustration")}
                />
            {:else}
                {#each data.trails as trail}
                    <a
                        class="w-full block"
                        href="/trail/view/@{trail.author}{trail.domain
                            ? '@' + trail.domain
                            : ''}/{trail.id}"
                    >
                        <TrailCard
                            {trail}
                            fullWidth
                            selected={false}
                            hovered={false}
                        ></TrailCard></a
                    >
                {/each}
            {/if}
        </div>
    </section>
    <section id="get-started" class="lg:px-8 lg:max-w-1/2 mb-12 lg:mb-16">
        <div class="px-5 lg:px-24 space-y-3 text-center">
            <h2 class="text-4xl lg:text-5xl font-bold">{$_("get-started")}</h2>
            <p>{$_("ready-to-join")}?</p>
            <a
                class="inline-block btn-primary btn-large"
                href="/login"
                role="button">{$_("signup-or-login")}</a
            >
        </div>
    </section>
{/if}

<style>
    @media (min-width: 64rem) {
        .hero {
            min-height: min(34rem, calc(100svh - var(--app-header-height)));
        }
    }
</style>
