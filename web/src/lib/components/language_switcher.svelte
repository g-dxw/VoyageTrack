<script lang="ts">
    import { defaultLocale, SUPPORTED_LOCALES } from "$lib/i18n/locales";
    import { localePreferenceCookie } from "$lib/i18n/preference";
    import { show_toast } from "$lib/stores/toast_store.svelte";
    import { _, locale } from "svelte-i18n";

    const languages = [
        ...["zh", "en"].filter((language) => SUPPORTED_LOCALES.includes(language)),
        ...SUPPORTED_LOCALES.filter((language) => language !== "zh" && language !== "en"),
    ].map((language) => ({
        value: language,
        text: language === "zh"
            ? "中文"
            : language === "en"
              ? "English"
              : new Intl.DisplayNames([language], { type: "language" }).of(language) ?? language,
    }));

    let switching = $state(false);

    async function changeLanguage(event: Event & { currentTarget: HTMLSelectElement }) {
        if (switching) return;

        const select = event.currentTarget;
        const language = select.value;
        if (!SUPPORTED_LOCALES.includes(language)) return;

        const previousLanguage = $locale ?? defaultLocale;
        switching = true;
        try {
            await locale.set(language);
            document.cookie = localePreferenceCookie(language, window.location.protocol === "https:");
        } catch {
            select.value = previousLanguage;
            show_toast({
                icon: "close",
                text: $_("error-loading-language"),
                type: "error",
            });
        } finally {
            switching = false;
        }
    }
</script>

<div class="relative inline-flex shrink-0 items-center">
    <i
        class="fa-solid fa-language pointer-events-none absolute left-2.5"
        aria-hidden="true"
    ></i>
    <select
        name="language"
        aria-label={$_("language")}
        aria-busy={switching}
        title={$_("language")}
        disabled={switching}
        value={$locale ?? defaultLocale}
        onchange={changeLanguage}
        class="h-11 sm:h-9 w-28 cursor-pointer rounded-lg border border-input-border bg-input-background pl-8 pr-1 text-sm text-content transition-colors hover:bg-secondary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-input-border-focus disabled:cursor-wait disabled:opacity-60 sm:w-36 lg:w-28 xl:w-36"
    >
        {#each languages as language}
            <option value={language.value} lang={language.value}>{language.text}</option>
        {/each}
    </select>
</div>
