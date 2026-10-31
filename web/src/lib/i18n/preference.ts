import { defaultLocale, normalizeLocale, SUPPORTED_LOCALES } from "./locales";

export const LOCALE_COOKIE_NAME = "wanderer_locale";

/** Only an explicitly supported language may override the account/browser default. */
export function readLocalePreference(raw: string | null | undefined): string | undefined {
    if (!raw || !/^[a-z]{2,5}(?:[-_][a-z0-9]{2,8})*$/i.test(raw.trim())) return undefined;
    const base = raw.trim().toLowerCase().split(/[-_]/)[0];
    return SUPPORTED_LOCALES.includes(base) ? normalizeLocale(raw) : undefined;
}

export function readLocaleCookie(cookieHeader: string): string | undefined {
    const prefix = `${LOCALE_COOKIE_NAME}=`;
    const cookie = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(prefix));
    if (!cookie) return undefined;
    try {
        return readLocalePreference(decodeURIComponent(cookie.slice(prefix.length)));
    } catch {
        return undefined;
    }
}

export function resolveLocalePreference(
    preferred: string | null | undefined,
    accountLanguage: string | null | undefined,
    browserLanguage: string | null | undefined,
): string {
    return readLocalePreference(preferred) ?? normalizeLocale(
        accountLanguage ?? browserLanguage?.split(",")[0] ?? defaultLocale,
    );
}

export function localePreferenceCookie(language: string, secure: boolean): string {
    const normalized = readLocalePreference(language);
    if (!normalized) throw new RangeError("Unsupported locale");
    return `${LOCALE_COOKIE_NAME}=${normalized}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}
