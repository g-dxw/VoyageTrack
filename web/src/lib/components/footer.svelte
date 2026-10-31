<script>
    import LogoTextLightWithVersion from "./logo/logo_text_light_with_version.svelte";
    import { _ } from "svelte-i18n";
</script>

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

<style>
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
