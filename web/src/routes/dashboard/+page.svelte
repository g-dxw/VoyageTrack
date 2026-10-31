<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import Pagination from "$lib/components/base/pagination.svelte";
    import TrailCard from "$lib/components/trail/trail_card.svelte";
    import { _ } from "svelte-i18n";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    function paginate(nextPage: number) {
        const url = new URL(page.url);
        url.searchParams.set("page", nextPage.toString());
        goto(url.pathname + url.search, { keepFocus: true });
    }
</script>

<svelte:head>
    <title>{$_("user-center")} | VoyageTrack</title>
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="mx-auto w-full max-w-7xl min-w-0 space-y-8 px-4 py-8 sm:px-8">
    <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 space-y-3">
            <h1 class="text-3xl sm:text-4xl font-bold text-balance">{$_("user-center")}</h1>
            <p class="max-w-2xl text-content text-pretty">{$_("dashboard-description")}</p>
        </div>
        <a class="btn-primary inline-flex min-h-11 items-center" href="/trail/edit/new">
            {$_("new-trail")}
        </a>
    </header>

    <div class="space-y-4">
        <h2 class="text-2xl font-semibold">{$_("my-trails")}</h2>
        {#if data.loadError}
            <div role="alert" class="rounded-xl border border-input-border bg-background p-6 space-y-4">
                <p>{$_("dashboard-load-error")}</p>
                <a class="btn-secondary inline-flex min-h-11 items-center" href="/dashboard" data-sveltekit-reload>
                    {$_("dashboard-retry")}
                </a>
            </div>
        {:else}
            {#if data.trails.items.length === 0}
                <p class="rounded-xl border border-input-border bg-background p-6">{$_("dashboard-empty")}</p>
            {:else}
                <div class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {#each data.trails.items as trail (trail.id)}
                        <article class="min-w-0 space-y-3" data-testid="dashboard-trail">
                            <TrailCard {trail} fullWidth selected={false} hovered={false} />
                            <div class="flex min-w-0 items-center justify-between gap-3 px-3">
                                <span class="text-sm" data-testid="dashboard-visibility">
                                    {trail.public ? $_("public") : $_("private")}
                                </span>
                                <a
                                    class="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-content underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                                    href={data.trailLinks[trail.id ?? ""]}
                                    aria-label="{$_('view')}: {trail.name}"
                                >{$_("view")}</a>
                            </div>
                        </article>
                    {/each}
                </div>
            {/if}
            {#if data.trails.totalPages > 1}
                <nav aria-label={$_("dashboard-pagination")} class="dashboard-pagination pt-4">
                    <Pagination
                        page={data.trails.page}
                        totalPages={data.trails.totalPages}
                        perPage={data.trails.perPage}
                        onpagination={paginate}
                    />
                </nav>
            {/if}
        {/if}
    </div>
</section>

<style>
    .dashboard-pagination :global(> div) {
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .dashboard-pagination :global(button) {
        min-width: 2.75rem;
        min-height: 2.75rem;
    }
</style>
