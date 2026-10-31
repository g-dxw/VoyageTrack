<script lang="ts">
    import emptyStateTrailDark from "$lib/assets/svgs/empty_states/empty_state_trail_dark.svg";
    import emptyStateTrailLight from "$lib/assets/svgs/empty_states/empty_state_trail_light.svg";
    import type { FeaturedTrail } from "$lib/models/featured_trail";
    import { getFileURL, isVideoURL } from "$lib/util/file_util";
    import { formatDistance, formatElevation } from "$lib/util/format_util";
    import { _, locale } from "svelte-i18n";

    let { featured }: { featured: FeaturedTrail } = $props();
    const uid = $props.id();
    const titleId = `featured-title-${uid}`;
    let failedThumbnail = $state<string | null>(null);
    const trail = $derived(featured.trail);
    const photo = $derived.by(() => {
        const photos = trail.photos ?? [];
        const preferred = photos.at(trail.thumbnail ?? 0);
        return [preferred, ...photos].find((item) => typeof item === "string" && item.length > 0 && !isVideoURL(item));
    });
    const thumbnail = $derived(photo ? getFileURL(trail, photo, "600x0") : "");
    const reason = $derived(featured.reason?.[$locale?.startsWith("zh") ? "zh" : "en"]);
    const hasDistance = $derived(typeof trail.distance === "number" && Number.isFinite(trail.distance) && trail.distance > 0);
    const hasElevation = $derived(typeof trail.elevation_gain === "number" && Number.isFinite(trail.elevation_gain) && trail.elevation_gain >= 0);
</script>

<a
    href={featured.href}
    aria-labelledby={titleId}
    class="featured-card group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-input-border bg-background text-content"
    data-testid="home-featured-card"
>
    <div class="relative aspect-[3/2] shrink-0 overflow-hidden bg-input-background">
        {#if thumbnail && failedThumbnail !== thumbnail}
            <img
                class="h-full w-full object-cover"
                src={thumbnail}
                alt={$_("home-featured-photo", { values: { name: trail.name } })}
                loading="lazy"
                decoding="async"
                width="600"
                height="338"
                onerror={() => { failedThumbnail = thumbnail; }}
            />
        {:else}
            <img class="featured-fallback-light h-full w-full object-contain p-4" src={emptyStateTrailLight} alt="" loading="lazy" width="600" height="338" />
            <img class="featured-fallback-dark h-full w-full object-contain p-4" src={emptyStateTrailDark} alt="" loading="lazy" width="600" height="338" />
            <span class="absolute bottom-3 left-4 rounded bg-background px-2 py-1 text-sm">{$_("home-featured-no-cover")}</span>
        {/if}
    </div>
    <div class="flex grow flex-col gap-3 p-4">
        <h3 id={titleId} class="text-xl font-semibold wrap-anywhere">{trail.name}</h3>
        {#if trail.location?.trim()}
            <p class="text-sm wrap-anywhere">{trail.location}</p>
        {/if}
        {#if reason?.trim()}
            <p class="featured-reason wrap-anywhere">{reason}</p>
        {/if}
        {#if hasDistance || hasElevation}
            <dl class="flex flex-wrap gap-x-6 gap-y-3">
                {#if hasDistance}
                    <div>
                        <dt class="text-sm">{$_("distance")}</dt>
                        <dd class="font-semibold">{formatDistance(trail.distance)}</dd>
                    </div>
                {/if}
                {#if hasElevation}
                    <div>
                        <dt class="text-sm">{$_("elevation-gain")}</dt>
                        <dd class="font-semibold">{formatElevation(trail.elevation_gain)}</dd>
                    </div>
                {/if}
            </dl>
        {/if}
        <span class="mt-auto inline-flex min-h-11 items-center gap-2 font-semibold">
            {$_("home-view-trail")}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true" focusable="false"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
        </span>
    </div>
</a>

<style>
    .featured-card {
        transition: background-color 200ms cubic-bezier(.32, .72, 0, 1);
    }

    .featured-card:hover {
        background-color: rgba(var(--secondary-hover));
    }

    .featured-card:active {
        outline: 1px solid currentColor;
        outline-offset: -1px;
    }

    .featured-card:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 4px;
    }

    .featured-reason {
        text-wrap: pretty;
    }

    .featured-fallback-dark {
        display: none;
    }

    :global(.dark) .featured-fallback-light {
        display: none;
    }

    :global(.dark) .featured-fallback-dark {
        display: block;
    }

    @media (prefers-reduced-motion: reduce) {
        .featured-card {
            transition: none;
        }
    }
</style>
