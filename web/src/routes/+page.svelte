<script lang="ts">
    import { sanitizeHTML } from "$lib/util/sanitize_html";
    import { localizeAboutMarkdown } from "$lib/i18n/about";
    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import Search, {
        type SearchItem,
    } from "$lib/components/base/search.svelte";
    import FloatingIsland from "$lib/components/3D/floating_island.svelte";
    import FeaturedTrailCard from "$lib/components/trail/featured_trail_card.svelte";
    import {
        defaultTrailSearchAttributes,
        type TrailSearchResult,
    } from "$lib/models/trail.js";
    import {
        searchActors,
        searchMulti,
        type ListSearchResult,
        type LocationSearchResult,
    } from "$lib/stores/search_store.js";
    import { getIconForLocation } from "$lib/util/icon_util.js";
    import { marked } from "marked";
    import { onMount } from "svelte";
    import { _ } from "svelte-i18n";

    let { data } = $props();

    let searchDropdownItems: SearchItem[] = $state([]);

    let aboutMarkdown = $state<string | null>(null);
    const about = $derived(marked.parse(
        localizeAboutMarkdown(aboutMarkdown, $_("home-about-description")),
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

</script>

<svelte:head>
    <title>{$_("home")} | VoyageTrack</title>
    <meta name="description" content={$_("home-hero-description")} />
</svelte:head>

<main class="homepage-content mx-auto w-full max-w-7xl px-4 sm:px-8 lg:px-12">
    <section class="hero relative isolate grid min-w-0 grid-cols-1 items-center gap-8 py-8 lg:grid-cols-2 lg:gap-6 lg:py-10" aria-labelledby="home-heading">
        <svg class="hero-contours pointer-events-none absolute hidden lg:block" viewBox="0 0 1000 520" fill="none" aria-hidden="true" focusable="false">
            <g stroke="currentColor" stroke-width="1">
                {#each [0, 24, 48, 72, 96, 120] as offset}
                    <path transform="translate(0 {offset})" d="M-80 430C70 450 130 150 300 220S490 460 650 240 870 300 1080 10" />
                {/each}
            </g>
        </svg>
        <div class="relative z-10 flex min-w-0 flex-col items-start gap-6 py-4 lg:py-8">
            <p class="home-eyebrow text-sm font-semibold">{$_("home-hero-eyebrow")}</p>
            <h1 id="home-heading" class="home-heading text-4xl lg:text-6xl font-bold">
                {$_("home-hero-title")}
            </h1>
            <p class="home-copy home-muted max-w-md text-base leading-relaxed">
                {$_("home-hero-description")}
            </p>
            <a class="home-action home-primary" href="/trails">
                {$_("home-browse-trails")}
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
            </a>
            <div class="home-search w-full max-w-lg">
                <Search
                    onupdate={search}
                    onclick={handleSearchClick}
                    large={true}
                    clearAfterSelect={false}
                    placeholder="{$_('search-for-trails-places')}..."
                    items={searchDropdownItems}
                />
            </div>
        </div>
        <div class="home-visual relative hidden min-w-0 lg:block">
            <FloatingIsland />
        </div>
    </section>

    <section id="trails" class="relative py-8 lg:py-12" aria-labelledby="home-featured-heading">
        <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div class="min-w-0 space-y-3">
                <h2 id="home-featured-heading" class="home-section-heading text-2xl sm:text-3xl font-bold">
                    {$_("home-featured-title")}
                </h2>
                {#if data.featuredTrails.length > 0}
                    <p class="home-copy home-muted text-base">{$_("home-featured-description")}</p>
                {/if}
            </div>
            <a class="home-text-link inline-flex min-h-11 items-center gap-2 font-semibold" href="/trails">
                {$_("home-browse-all-trails")}
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
            </a>
        </div>
        {#if data.featuredTrails.length > 0}
            <ul class="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label={$_("home-featured-title")}>
                {#each data.featuredTrails as featured (featured.trail.id)}
                    <li class="min-w-0"><FeaturedTrailCard {featured} /></li>
                {/each}
            </ul>
        {:else}
            <div class="home-empty flex min-h-60 flex-col items-center justify-center gap-4 rounded-xl border border-input-border px-6 py-10 text-center" data-testid="home-featured-empty">
                <svg class="home-empty-landscape" viewBox="0 0 120 80" width="96" height="64" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false">
                    <path d="m10 65 25-39 17 23 21-34 37 50H10Z" stroke-linejoin="round" />
                    <path d="m62 33 11-18 12 19-12-6-11 5Zm-37 9 10-16 11 15-11-4-10 5Z" stroke-linejoin="round" />
                    <path d="M37 69c8-11 45-8 46-17 0-4-11-4-8-9" stroke-dasharray="3 4" />
                    <circle cx="22" cy="17" r="5" />
                </svg>
                <h3 class="text-xl font-semibold">
                    {$_(data.featuredTrailsUnavailable ? "home-featured-unavailable-title" : "home-featured-empty-title")}
                </h3>
                <p class="home-copy home-muted max-w-xl" role={data.featuredTrailsUnavailable ? "status" : undefined}>
                    {$_(data.featuredTrailsUnavailable ? "home-featured-unavailable" : "home-featured-empty")}
                </p>
            </div>
        {/if}
    </section>

    <section id="get-started" class="home-invitation relative isolate my-8 overflow-hidden rounded-xl px-6 py-8 sm:px-10 sm:py-10 lg:my-12" aria-labelledby="home-invitation-heading">
        <svg class="invitation-landscape pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 320" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
            <circle cx="925" cy="70" r="24" class="landscape-sun" />
            <path d="M350 320 625 128 718 181 877 52 984 150 1080 91 1230 214V340H350Z" class="landscape-back" />
            <path d="m565 320 181-148 100 61 126-132 97 111 131-70v198H565Z" class="landscape-middle" />
            <path d="M550 320c153-83 223-88 339-81 110 8 177-79 311-78v179H550Z" class="landscape-front" />
            <g class="landscape-trees">
                {#each [{ x: 748, y: 217, s: .8 }, { x: 800, y: 237, s: .6 }, { x: 1093, y: 159, s: 1.1 }, { x: 1150, y: 163, s: 1.5 }, { x: 1197, y: 205, s: 1.2 }] as tree}
                    <path transform="translate({tree.x} {tree.y}) scale({tree.s})" d="M0-52-11-31h7L-17-13h10L-22 9H-3v14h6V9h19L7-13h10L4-31h7L0-52Z" />
                {/each}
            </g>
            <path d="M878 331c-21-27 84-35 72-52-8-13-55-15-22-29 21-9 58-11 60-23 2-8-13-11-8-17" class="landscape-trail" fill="none" stroke-width="9" stroke-linecap="round" />
        </svg>
        <div class="relative z-10 max-w-2xl space-y-5">
            <h2 id="home-invitation-heading" class="home-section-heading text-2xl sm:text-3xl font-bold">{$_("home-invitation-title")}</h2>
            <section id="about" aria-label={$_("about")}>
                <div class="prose home-copy home-muted max-w-xl dark:prose-invert">
                    {@html sanitizeHTML(about)}
                </div>
            </section>
            {#if page.data.user}
                <a class="home-action home-secondary" href="/dashboard">
                    {$_("home-open-user-center")}
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
                </a>
            {:else}
                <a class="home-action home-secondary" href="/login">
                    {$_("signup-or-login")}
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
                </a>
            {/if}
        </div>
    </section>
</main>

<style>
    .homepage-content {
        color: rgba(var(--content));
    }

    .hero-contours {
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: .045;
    }

    .home-heading {
        max-width: 11em;
        text-wrap: balance;
    }

    .home-section-heading {
        text-wrap: balance;
    }

    .home-copy {
        text-wrap: pretty;
    }

    .home-muted {
        color: rgba(var(--content), .68);
    }

    .home-eyebrow {
        color: rgba(var(--content), .60);
        letter-spacing: .12em;
    }

    .home-search :global(.relative.w-full) {
        width: 100%;
        min-width: 0;
        max-width: none;
    }

    .home-action {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 8px 16px;
        border: 1px solid rgba(var(--content));
        border-radius: .5rem;
        font-weight: 600;
        transition: background-color 200ms cubic-bezier(.32, .72, 0, 1), color 200ms cubic-bezier(.32, .72, 0, 1);
    }

    .home-primary {
        color: rgba(var(--background));
        background: rgba(var(--content));
    }

    .home-primary:hover {
        background: rgba(var(--content), .84);
    }

    .home-secondary {
        background: rgba(var(--background), .78);
    }

    .home-secondary:hover {
        color: rgba(var(--background));
        background: rgba(var(--content));
    }

    .home-action:focus-visible,
    .home-text-link:focus-visible {
        outline: 2px solid rgba(var(--content));
        outline-offset: 4px;
        border-radius: .5rem;
    }

    .home-text-link:hover {
        text-decoration: underline;
        text-underline-offset: 4px;
    }

    .home-action:active {
        transform: translateY(1px);
    }

    .home-empty {
        background: rgba(var(--content), .025);
    }

    .home-empty-landscape {
        color: rgba(var(--content), .36);
    }

    .home-invitation {
        background: rgba(var(--content), .05);
    }

    .invitation-landscape {
        left: 30%;
        width: 70%;
        opacity: .8;
    }

    .landscape-sun {
        fill: rgba(var(--background));
    }

    .landscape-back {
        fill: rgba(var(--content), .08);
    }

    .landscape-middle {
        fill: rgba(var(--content), .12);
    }

    .landscape-front {
        fill: rgba(var(--content), .20);
    }

    .landscape-trees {
        fill: rgba(var(--content), .26);
    }

    .landscape-trail {
        stroke: rgba(var(--background), .86);
    }

    @media (max-width: 63.999rem) {
        .invitation-landscape {
            left: 45%;
            width: 55%;
            opacity: .35;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .home-action {
            transition: none;
        }
    }
</style>
