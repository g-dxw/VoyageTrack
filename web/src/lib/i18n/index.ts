import { browser } from '$app/environment';
import { getPb } from '$lib/pocketbase';
import { init, register } from 'svelte-i18n';
import { defaultLocale, LOCALE_LOADERS } from './locales';
import { readLocaleCookie, resolveLocalePreference } from './preference';

for (const [localeKey, loader] of Object.entries(LOCALE_LOADERS)) {
    register(localeKey, loader)
}

const userLang = browser ? getPb().authStore.record?.language : null;
const navigatorLang = browser ? window.navigator.language : null;

const preferred = browser ? readLocaleCookie(document.cookie) : undefined;
const initial = resolveLocalePreference(preferred, userLang, navigatorLang);

init({
    fallbackLocale: defaultLocale,
    initialLocale: initial,
    formats: {
        date: {
            monthName: { month: 'long' }
        },
        number: {},
        time: {}
    },
})
