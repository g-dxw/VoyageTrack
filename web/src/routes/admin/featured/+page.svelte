<script lang="ts">
    import Button from "$lib/components/base/button.svelte";
    import Pagination from "$lib/components/base/pagination.svelte";
    import TextField from "$lib/components/base/text_field.svelte";
    import type { FeaturedTrail, FeaturedTrailReason } from "$lib/models/featured_trail";
    import {
        MAX_HOMEPAGE_FEATURED,
        MAX_HOMEPAGE_REASON,
        type HomepageFeaturedAdminConfig,
        type HomepageFeaturedEntry,
        type HomepageFeaturedSelection,
    } from "$lib/models/homepage_featured";
    import { getFileURL, isVideoURL } from "$lib/util/file_util";
    import type { ListResult } from "pocketbase";
    import { onDestroy, untrack } from "svelte";
    import { _ } from "svelte-i18n";
    import type { PageData } from "./$types";

    let { data }: { data: PageData } = $props();

    interface DraftSelection extends HomepageFeaturedSelection {
        reason: FeaturedTrailReason;
    }
    type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

    function draftFrom(items: HomepageFeaturedSelection[]): DraftSelection[] {
        return items.map(item => ({ ...item, reason: { en: item.reason?.en ?? "", zh: item.reason?.zh ?? "" } }));
    }

    function entriesForSave(items: readonly HomepageFeaturedEntry[]): HomepageFeaturedEntry[] {
        return items.map(item => {
            const en = item.reason?.en.trim() ?? "";
            const zh = item.reason?.zh.trim() ?? "";
            return { id: item.id, ...(en || zh ? { reason: { en, zh } } : {}) };
        });
    }

    const serialized = (items: readonly HomepageFeaturedEntry[]) => JSON.stringify(entriesForSave(items));
    let revision = $state(untrack(() => data.selection.revision));
    let draft = $state<DraftSelection[]>(untrack(() => draftFrom(data.selection.items)));
    let savedEntries = $state(untrack(() => serialized(data.selection.items)));
    const dirty = $derived(serialized(draft) !== savedEntries);
    let saveState = $state<SaveState>("idle");
    let saveError = $state("featured-admin-save-error");
    let refreshing = $state(false);
    const editingDisabled = $derived(saveState === "saving" || refreshing);
    let announcement = $state("");

    let candidates = $state<ListResult<FeaturedTrail>>(untrack(() => data.candidates));
    let candidateError = $state(untrack(() => data.candidateError));
    let candidateErrorKey = $state("featured-admin-candidate-error");
    let candidateLoading = $state(false);
    let requestedCandidatePage = $state(untrack(() => data.candidates.page));
    let searchQuery = $state("");
    let appliedQuery = $state("");
    let failedCovers = $state<Record<string, boolean>>({});
    let requestNumber = 0;
    let candidateRequest: AbortController | undefined;
    let active = true;

    onDestroy(() => {
        active = false;
        requestNumber++;
        candidateRequest?.abort();
    });

    function coverFor(featured?: FeaturedTrail) {
        if (!featured) return "";
        const photos = featured.trail.photos ?? [];
        const preferred = photos.at(featured.trail.thumbnail ?? 0);
        const photo = [preferred, ...photos].find(value => typeof value === "string" && value.length > 0 && !isVideoURL(value));
        const source = photo ? getFileURL(featured.trail, photo, "600x0") : "";
        return failedCovers[source] ? "" : source;
    }

    function authorFor(featured: FeaturedTrail) {
        const author = featured.trail.expand?.author;
        if (!author?.preferred_username) return $_("featured-admin-author-unavailable");
        return `@${author.preferred_username}${!author.is_local && author.domain ? `@${author.domain}` : ""}`;
    }

    function errorKey(message: unknown, status: number, fallback: string) {
        if (status === 401 || message === "homepage_auth_required") return "featured-admin-session-error";
        if (status === 403 || message === "homepage_editor_required" || message === "homepage_invalid_origin") return "featured-admin-permission-error";
        if (status === 409 || message === "homepage_revision_conflict") return "featured-admin-conflict";
        if (status === 503 || message === "homepage_unavailable") return "featured-admin-service-error";
        if (["invalid_request", "homepage_invalid_request", "homepage_invalid_revision", "homepage_too_many_items", "homepage_duplicate_trail", "homepage_invalid_reason", "homepage_invalid_trail"].includes(typeof message === "string" ? message : "")) return fallback === "featured-admin-candidate-error" ? fallback : "featured-admin-invalid-error";
        return fallback;
    }

    async function responseError(response: Response, fallback: string) {
        try {
            const body: { message?: unknown } = await response.json();
            return errorKey(body.message, response.status, fallback);
        } catch {
            return errorKey(undefined, response.status, fallback);
        }
    }

    async function loadCandidates(nextPage = 1, query = appliedQuery) {
        const current = ++requestNumber;
        candidateRequest?.abort();
        const controller = new AbortController();
        candidateRequest = controller;
        candidateLoading = true;
        appliedQuery = query;
        requestedCandidatePage = nextPage;
        try {
            const response = await fetch(`/api/v1/admin/featured/candidates?${new URLSearchParams({ q: query, page: String(nextPage) })}`, {
                signal: controller.signal, cache: "no-store",
            });
            if (!response.ok) {
                const message = await responseError(response, "featured-admin-candidate-error");
                if (active && current === requestNumber) {
                    candidateError = true;
                    candidateErrorKey = message;
                }
                return;
            }
            const result: ListResult<FeaturedTrail> = await response.json();
            if (!Array.isArray(result.items) || !Number.isInteger(result.page)) throw new Error("Invalid candidate response");
            if (active && current === requestNumber) {
                candidates = result;
                candidateError = false;
            }
        } catch {
            if (active && current === requestNumber && !controller.signal.aborted) {
                candidateError = true;
                candidateErrorKey = "featured-admin-candidate-error";
            }
        } finally {
            if (active && current === requestNumber) candidateLoading = false;
        }
    }

    function search(event: SubmitEvent) {
        event.preventDefault();
        void loadCandidates(1, searchQuery.trim());
    }

    function isSelected(candidate: FeaturedTrail) {
        return draft.some(item => item.id === candidate.trail.id);
    }

    function addCandidate(featured: FeaturedTrail) {
        if (editingDisabled || !featured.trail.id || isSelected(featured) || draft.length >= MAX_HOMEPAGE_FEATURED) return;
        draft.push({ id: featured.trail.id, featured, reason: { en: "", zh: "" } });
        announcement = $_("featured-admin-added-announcement", { values: { name: featured.trail.name } });
        if (saveState === "saved") saveState = "idle";
    }

    function removeSelection(index: number) {
        if (editingDisabled) return;
        const [removed] = draft.splice(index, 1);
        announcement = $_("featured-admin-removed-announcement", { values: { name: removed.featured?.trail.name ?? removed.id } });
        if (saveState === "saved") saveState = "idle";
    }

    function moveSelection(index: number, direction: -1 | 1) {
        const next = index + direction;
        if (editingDisabled || next < 0 || next >= draft.length) return;
        const reordered = [...draft];
        [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
        draft = reordered;
        announcement = $_("featured-admin-moved-announcement", { values: { name: draft[next].featured?.trail.name ?? draft[next].id, position: next + 1 } });
        if (saveState === "saved") saveState = "idle";
    }

    function applySelection(result: HomepageFeaturedAdminConfig) {
        revision = result.revision;
        draft = draftFrom(result.items);
        savedEntries = serialized(result.items);
    }

    async function save(event: SubmitEvent) {
        event.preventDefault();
        if (!dirty || editingDisabled) return;
        saveState = "saving";
        try {
            const response = await fetch("/api/v1/admin/featured", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ revision, items: entriesForSave(draft) }),
            });
            if (!response.ok) {
                const message = await responseError(response, "featured-admin-save-error");
                if (active) {
                    saveError = message;
                    saveState = response.status === 409 ? "conflict" : "error";
                }
                return;
            }
            const result: HomepageFeaturedAdminConfig = await response.json();
            if (!Number.isInteger(result.revision) || !Array.isArray(result.items)) throw new Error("Invalid selection response");
            if (active) {
                applySelection(result);
                saveState = "saved";
                announcement = $_("featured-admin-saved");
            }
        } catch {
            if (active) {
                saveError = "featured-admin-save-error";
                saveState = "error";
            }
        }
    }

    async function refreshSelection() {
        if (editingDisabled) return;
        refreshing = true;
        try {
            const response = await fetch("/api/v1/admin/featured", { cache: "no-store" });
            if (!response.ok) {
                const message = await responseError(response, "featured-admin-refresh-error");
                if (active) saveError = message;
                return;
            }
            const result: HomepageFeaturedAdminConfig = await response.json();
            if (!Number.isInteger(result.revision) || !Array.isArray(result.items)) throw new Error("Invalid selection response");
            if (active) {
                applySelection(result);
                saveState = "idle";
                announcement = $_("featured-admin-refreshed");
            }
        } catch {
            if (active) saveError = "featured-admin-refresh-error";
        } finally {
            if (active) refreshing = false;
        }
    }
</script>

{#snippet thumbnail(featured: FeaturedTrail | undefined)}
    {@const photo = coverFor(featured)}
    <div class="admin-thumbnail flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-input-border bg-input-background">
        {#if photo && featured}
            <img src={photo} alt={$_("home-featured-photo", { values: { name: featured.trail.name } })} loading="lazy" width="128" height="96" class="h-full w-full object-cover" onerror={() => { failedCovers[photo] = true; }} />
        {:else}
            <svg viewBox="0 0 80 56" width="48" height="36" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true" focusable="false"><path d="m5 47 20-32 12 18 11-22 27 36H5Z" stroke-linejoin="round" /><path d="m40 27 8-16 10 17-10-6-8 5Z" /></svg>
        {/if}
    </div>
{/snippet}

<svelte:head>
    <title>{$_("featured-admin-title")} | VoyageTrack</title>
    <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="featured-admin mx-auto min-h-screen w-full max-w-7xl space-y-8 px-4 py-8 sm:px-8">
    <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="max-w-3xl space-y-3">
            <h1 class="text-2xl sm:text-3xl font-bold">{$_("featured-admin-title")}</h1>
            <p class="admin-muted text-base">{$_("featured-admin-description")}</p>
        </div>
        <a class="admin-link inline-flex min-h-11 items-center rounded-lg px-3 font-semibold" href="/" target="_blank" rel="noopener noreferrer">{$_("featured-admin-open-home")}</a>
    </header>

    <p class="sr-only" role="status" aria-live="polite">{announcement}</p>

    <div class="grid min-w-0 items-start gap-6 lg:grid-cols-2">
        <section class="min-w-0 space-y-6 rounded-xl border border-input-border bg-background p-4 sm:p-6" aria-labelledby="featured-candidates-heading">
            <div class="space-y-2">
                <h2 id="featured-candidates-heading" class="text-xl font-semibold">{$_("featured-admin-candidates-title")}</h2>
                <p class="admin-muted text-sm">{$_("featured-admin-candidates-description")}</p>
            </div>
            <form onsubmit={search} class="space-y-3" role="search" aria-label={$_("featured-admin-search-label")}>
                <TextField name="featured-query" type="search" autocomplete="off" label={$_("featured-admin-search-label")} placeholder={$_("featured-admin-search-placeholder")} bind:value={searchQuery} />
                <Button type="submit" secondary loading={candidateLoading}>{$_("featured-admin-search")}</Button>
            </form>

            <div class="space-y-4" aria-busy={candidateLoading}>
                {#if candidateLoading}<p role="status" class="admin-muted text-sm">{$_("featured-admin-searching")}</p>{/if}
                {#if candidateError}
                    <div role="alert" class="space-y-3 rounded-lg border border-input-border p-4">
                        <p>{$_(candidateErrorKey)}</p>
                        <Button type="button" secondary disabled={candidateLoading} onclick={() => loadCandidates(requestedCandidatePage, appliedQuery)}>{$_("featured-admin-retry-search")}</Button>
                    </div>
                {:else if candidates.items.length === 0}
                    <p class="admin-muted rounded-lg bg-input-background p-6 text-center">{$_("featured-admin-candidates-empty")}</p>
                {:else}
                    <p class="admin-muted text-sm" role="status">{$_("featured-admin-candidate-count", { values: { count: candidates.totalItems } })}</p>
                    <ul class="space-y-4" data-testid="featured-candidates">
                        {#each candidates.items as candidate (candidate.trail.id)}
                            <li class="space-y-3 rounded-lg border border-input-border p-3" data-testid="featured-candidate">
                                <div class="flex min-w-0 items-start gap-3">
                                    {@render thumbnail(candidate)}
                                    <div class="min-w-0 space-y-1">
                                        <h3 class="text-lg font-semibold wrap-anywhere">{candidate.trail.name}</h3>
                                        <p class="admin-muted text-sm wrap-anywhere">{authorFor(candidate)}</p>
                                        {#if candidate.trail.location}<p class="admin-muted text-sm wrap-anywhere">{candidate.trail.location}</p>{/if}
                                    </div>
                                </div>
                                <div class="flex flex-wrap items-center justify-between gap-3">
                                    <a class="admin-link inline-flex min-h-11 items-center rounded px-2 text-sm underline underline-offset-4" href={candidate.href} target="_blank" rel="noopener noreferrer" aria-label={$_("featured-admin-view-detail-label", { values: { name: candidate.trail.name } })}>{$_("featured-admin-view-detail")}</a>
                                    <Button type="button" secondary disabled={editingDisabled || isSelected(candidate) || draft.length >= MAX_HOMEPAGE_FEATURED} onclick={() => addCandidate(candidate)}>{$_(isSelected(candidate) ? "featured-admin-already-added" : "featured-admin-add")}</Button>
                                </div>
                            </li>
                        {/each}
                    </ul>
                {/if}
                {#if !candidateError && candidates.totalPages > 1}
                    <nav class="admin-pagination" aria-label={$_("featured-admin-candidates-pagination")}>
                        <Pagination page={candidates.page} totalPages={candidates.totalPages} perPage={candidates.perPage} onpagination={next => loadCandidates(next, appliedQuery)} />
                    </nav>
                {/if}
            </div>
        </section>

        <form onsubmit={save} class="min-w-0 space-y-6 rounded-xl border border-input-border bg-background p-4 sm:p-6" aria-labelledby="featured-selection-heading" data-testid="featured-selection-form">
            <div class="space-y-2">
                <h2 id="featured-selection-heading" class="text-xl font-semibold">{$_("featured-admin-selection-title", { values: { count: draft.length, limit: MAX_HOMEPAGE_FEATURED } })}</h2>
                <p class="admin-muted text-sm">{$_("featured-admin-selection-description")}</p>
            </div>
            {#if draft.length >= MAX_HOMEPAGE_FEATURED}<p role="status" class="rounded-lg bg-input-background p-3 text-sm">{$_("featured-admin-limit", { values: { limit: MAX_HOMEPAGE_FEATURED } })}</p>{/if}
            {#if draft.length === 0}
                <p class="admin-muted rounded-lg bg-input-background p-6 text-center">{$_("featured-admin-selection-empty")}</p>
            {:else}
                <ol class="space-y-4" data-testid="featured-selection">
                    {#each draft as selection, index (selection.id)}
                        <li class="space-y-4 rounded-lg border border-input-border p-4" data-testid="featured-selected-item" data-trail-id={selection.id}>
                            <div class="flex min-w-0 items-start gap-3">
                                <span class="admin-order flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-input-border text-sm font-semibold" aria-hidden="true">{index + 1}</span>
                                <div class="min-w-0 grow space-y-2">
                                    <h3 class="text-lg font-semibold wrap-anywhere">{selection.featured?.trail.name ?? selection.id}</h3>
                                    {#if selection.featured}
                                        <p class="admin-muted text-sm wrap-anywhere">{authorFor(selection.featured)}</p>
                                        <a class="admin-link inline-flex min-h-11 items-center rounded text-sm underline underline-offset-4" href={selection.featured.href} target="_blank" rel="noopener noreferrer" aria-label={$_("featured-admin-view-detail-label", { values: { name: selection.featured.trail.name } })}>{$_("featured-admin-view-detail")}</a>
                                    {:else}
                                        <p class="text-sm font-semibold">{$_("featured-admin-inactive")}</p>
                                        <p class="admin-muted text-sm">{$_("featured-admin-inactive-description")}</p>
                                    {/if}
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <button type="button" class="admin-control btn-secondary" disabled={editingDisabled || index === 0} aria-label={$_("featured-admin-move-up-label", { values: { name: selection.featured?.trail.name ?? selection.id } })} onclick={() => moveSelection(index, -1)}>{$_("move-up")}</button>
                                <button type="button" class="admin-control btn-secondary" disabled={editingDisabled || index === draft.length - 1} aria-label={$_("featured-admin-move-down-label", { values: { name: selection.featured?.trail.name ?? selection.id } })} onclick={() => moveSelection(index, 1)}>{$_("move-down")}</button>
                                <button type="button" class="admin-control btn-secondary" disabled={editingDisabled} aria-label={$_("featured-admin-remove-label", { values: { name: selection.featured?.trail.name ?? selection.id } })} onclick={() => removeSelection(index)}>{$_("remove")}</button>
                            </div>
                            <div class="grid gap-3 sm:grid-cols-2">
                                <div class="space-y-1">
                                    <label class="block text-sm font-medium" for="featured-reason-zh-{selection.id}">{$_("featured-admin-reason-zh")}</label>
                                    <textarea id="featured-reason-zh-{selection.id}" name="reason-zh-{selection.id}" class="admin-reason block w-full min-w-0 rounded-lg border border-input-border bg-input-background px-3 py-2" rows="3" maxlength={MAX_HOMEPAGE_REASON} bind:value={selection.reason.zh} disabled={editingDisabled} aria-describedby="featured-reason-hint-{selection.id}"></textarea>
                                </div>
                                <div class="space-y-1">
                                    <label class="block text-sm font-medium" for="featured-reason-en-{selection.id}">{$_("featured-admin-reason-en")}</label>
                                    <textarea id="featured-reason-en-{selection.id}" name="reason-en-{selection.id}" class="admin-reason block w-full min-w-0 rounded-lg border border-input-border bg-input-background px-3 py-2" rows="3" maxlength={MAX_HOMEPAGE_REASON} bind:value={selection.reason.en} disabled={editingDisabled} aria-describedby="featured-reason-hint-{selection.id}"></textarea>
                                </div>
                            </div>
                            <p id="featured-reason-hint-{selection.id}" class="admin-muted text-sm">{$_("featured-admin-reason-hint", { values: { limit: MAX_HOMEPAGE_REASON } })}</p>
                        </li>
                    {/each}
                </ol>
            {/if}

            <div class="space-y-4 border-t border-input-border pt-6">
                <p class="text-sm" role="status" aria-live="polite" data-testid="featured-draft-status">
                    {#if refreshing}{$_("featured-admin-refreshing")}
                    {:else if saveState === "saving"}{$_("featured-admin-saving")}
                    {:else if dirty}{$_("featured-admin-unsaved")}
                    {:else if saveState === "saved"}{$_("featured-admin-saved")}
                    {:else}{$_("featured-admin-current")}{/if}
                </p>
                {#if saveState === "error" || saveState === "conflict"}
                    <div role="alert" class="space-y-3 rounded-lg border border-input-border p-4" data-testid="featured-save-error">
                        <p>{$_(saveError)}</p>
                        {#if saveState === "conflict"}
                            <Button type="button" secondary loading={refreshing} disabled={editingDisabled} onclick={refreshSelection}>{$_("featured-admin-load-latest")}</Button>
                        {/if}
                    </div>
                {/if}
                <Button type="submit" primary loading={saveState === "saving"} disabled={!dirty || refreshing}>{$_("featured-admin-save")}</Button>
            </div>
        </form>
    </div>
</main>

<style>
    .featured-admin {
        --content: 24, 24, 24;
        --background: 255, 255, 255;
        --input-background: 248, 248, 248;
        --input-border: 218, 218, 218;
        --input-border-focus: 50, 50, 50;
        --secondary-hover: 242, 242, 242;
        --input-ring: 170, 170, 170;
        color: rgba(var(--content));
    }
    :global(.dark) .featured-admin {
        --content: 242, 242, 242;
        --background: 24, 24, 24;
        --input-background: 31, 31, 31;
        --input-border: 68, 68, 68;
        --input-border-focus: 210, 210, 210;
        --secondary-hover: 45, 45, 45;
        --input-ring: 145, 145, 145;
    }
    .admin-muted { color: rgba(var(--content), .72); }
    .admin-thumbnail { color: rgba(var(--content), .42); }
    .admin-link:focus-visible, .admin-reason:focus-visible {
        outline: 2px solid rgba(var(--content));
        outline-offset: 3px;
    }
    .admin-link:hover { text-decoration: underline; }
    .admin-control:disabled { opacity: .45; cursor: default; }
    .admin-control { min-height: 44px; }
    .admin-reason { resize: vertical; }
    .admin-pagination :global(> div) { flex-wrap: wrap; gap: 8px; }
    .admin-pagination :global(button) { min-width: 44px; min-height: 44px; }
    .featured-admin :global(.btn-primary) {
        color: rgba(var(--background));
        background-color: rgba(var(--content));
    }
    .featured-admin :global(.btn-primary:disabled) { opacity: .5; }
</style>
