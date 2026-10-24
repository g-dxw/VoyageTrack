<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/state";
    import Select, { type SelectItem } from "$lib/components/base/select.svelte";
    import { _ } from "svelte-i18n";
    import type { Snippet } from "svelte";
    interface Props {
        children?: Snippet;
    }

    let { children }: Props = $props();

    const settingsLinks: SelectItem[] = $derived([
        { text: $_("profile"), value: "/settings/profile" },
        { text: $_("my-account"), value: "/settings/account" },
        { text: $_("privacy"), value: "/settings/privacy" },

        {
            text: $_("language") + " & " + $_("units"),
            value: "/settings/language",
        },
        { text: $_("notifications"), value: "/settings/notifications" },
        { text: $_("map"), value: "/settings/map" },
        { text: $_("categories"), value: "/settings/categories" },
        { text: $_("plugins"), value: "/settings/plugins" },
        { text: $_("similar-trails"), value: "/settings/maintenance/similar-trails" },
        { text: `${$_("import")}/${$_("export")}`, value: "/settings/export" },
        {
            text: $_("help"),
            value: "https://wanderer.to/run/installation/quick",
        },
    ]);

    const navigationItems = $derived(
        settingsLinks.filter((item) => item.value.startsWith("/settings/")),
    );
</script>

<div
    class="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] max-w-6xl mx-4 md:mx-auto gap-x-6 items-start"
>
    <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end mb-4 md:hidden">
        <Select
            name="settings-section"
            label={$_("settings")}
            items={navigationItems}
            value={page.url.pathname}
            onchange={(value: string) => goto(value)}
            fullWidth
        />
        <a
            class="btn-secondary inline-flex items-center justify-center gap-2"
            href="https://wanderer.to/run/installation/quick"
            target="_blank"
            rel="noopener noreferrer"
        >
            <i class="fa fa-external-link text-sm" aria-hidden="true"></i>
            {$_("help")}
        </a>
    </div>
    <nav class="hidden md:block p-2 border border-input-border rounded-xl" aria-label={$_("settings")}>
        <ul>
            {#each settingsLinks as item}
                {@const external = !item.value.startsWith("/settings/")}
                <li>
                    <a
                        href={item.value}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                        aria-current={item.value === page.url.pathname ? "page" : undefined}
                        class="menu-item flex min-h-9 items-center px-3 py-2 text-sm leading-5 hover:bg-menu-item-background-hover focus-visible:bg-menu-item-background-focus focus-visible:outline-2 focus-visible:outline-input-border-focus transition-colors rounded-md"
                        class:bg-menu-item-background-hover={item.value === page.url.pathname}
                    >
                        {item.text}
                    </a>
                </li>
            {/each}
        </ul>
    </nav>
    <div class="settings-content min-w-0">
        {@render children?.()}
    </div>
</div>
