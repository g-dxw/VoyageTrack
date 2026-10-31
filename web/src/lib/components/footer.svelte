<script lang="ts">
    import LogoTextLightWithVersion from "./logo/logo_text_light_with_version.svelte";
    import { _ } from "svelte-i18n";
    import VoyageTrack from "./logo/voyage_track.svelte";

    let { homeVariant = false }: { homeVariant?: boolean } = $props();
</script>

{#if homeVariant}
    <footer class="home-footer mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-8">
        <a href="/" aria-label="VoyageTrack" class="w-40 shrink-0 [&>svg]:w-full [&>svg]:h-auto">
            <VoyageTrack />
        </a>
        <nav aria-label={$_("resources")} class="flex flex-wrap items-center gap-6 text-sm">
            <a href="/#about">{$_("about")}</a>
            <a href="https://wanderer.to/run/installation/quick/">{$_("help")}</a>
            <a href="https://github.com/g-dxw/VoyageTrack">GitHub</a>
        </nav>
    </footer>
{:else}
<footer
    class="bg-footer-background text-white w-full grid grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 p-5 sm:p-6 mt-6 rounded-t-2xl"
>
    <div class="col-span-3 lg:col-span-1 w-40 max-w-full [&>div]:w-full [&_svg]:w-full [&_svg]:h-auto">
        <LogoTextLightWithVersion></LogoTextLightWithVersion>
    </div>
    <div>
        <h5 class="font-semibold">{$_("resources")}</h5>
        <ul class="mt-2 text-sm">
            <li>
                <a href="https://wanderer.to/run/installation/quick/"
                    >{$_("documentation")}</a
                >
            </li>
            <li>
                <a href="https://wanderer.to/api-reference"
                    >{$_("api-documentation")}</a
                >
            </li>
            <li><a href="https://pocketbase.io/">PocketBase</a></li>
            <li><a href="https://www.meilisearch.com/">meilisearch</a></li>
        </ul>
    </div>
    <div>
        <h5 class="font-semibold">wanderer</h5>
        <ul class="mt-2 text-sm">
            <li>
                <a href="https://wanderer.to">{$_("about")}</a>
            </li>
            <li>
                <a href="https://wanderer.to/#features">{$_("features")}</a>
            </li>
            <li>
                <a href="https://wanderer.to/changelog/"
                    >{$_("changelog")}</a
                >
            </li>
            <li>
                <a href="https://github.com/open-wanderer/wanderer/blob/main/LICENSE"
                    >{$_("license")}</a
                >
            </li>
        </ul>
    </div>
    <div>
        <h5 class="font-semibold">{$_("community")}</h5>
        <ul class="mt-2 text-sm">
            <li><a href="https://github.com/open-wanderer/wanderer">GitHub</a></li>
            <li>
                <a href="https://github.com/open-wanderer/wanderer/issues">{$_("issues")}</a>
            </li>
            <li>
                <a href="https://github.com/open-wanderer/wanderer/pulls"
                    >{$_("contribute")}</a
                >
            </li>
        </ul>
    </div>
</footer>
{/if}

<style>
    .home-footer {
        color: rgb(var(--content));
        border-top: 1px solid rgb(var(--separator));
    }
    .home-footer a { min-height: 2.75rem; }
    .home-footer nav a { text-underline-offset: 0.3rem; }
    .home-footer nav a:hover { text-decoration: underline; }

    footer li:not(:last-child) {
        margin-bottom: 2px;
    }

    footer a {
        display: inline-flex;
        min-height: 1.5rem;
        align-items: center;
        overflow-wrap: anywhere;
    }
</style>
