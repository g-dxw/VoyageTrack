import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "./locales";
import { LOCALE_COOKIE_NAME, localePreferenceCookie, readLocaleCookie, readLocalePreference, resolveLocalePreference } from "./preference";

describe("browser language preference", () => {
    it.each(SUPPORTED_LOCALES)("accepts the supported locale %s", language => {
        expect(readLocalePreference(language)).toBe(language);
    });

    it.each(["zh-CN", "zh_Hans", "zh-Hans-CN", " ZH-cn "])("normalizes %s", language => {
        expect(readLocalePreference(language)).toBe("zh");
    });

    it.each([undefined, null, "", "unsupported", "xx", "constructor", "en; Path=/", "zh,q=1"])("ignores invalid values: %s", value => {
        expect(readLocalePreference(value)).toBeUndefined();
        expect(resolveLocalePreference(value, "zh", "en-US")).toBe("zh");
    });

    it("gives an explicit browser preference priority over account and browser defaults", () => {
        expect(resolveLocalePreference("en", "zh", "de-DE")).toBe("en");
        expect(resolveLocalePreference("zh", undefined, "en-US")).toBe("zh");
    });

    it("preserves account, browser and default fallbacks without an explicit preference", () => {
        expect(resolveLocalePreference(undefined, "de", "zh-CN")).toBe("de");
        expect(resolveLocalePreference(undefined, null, "zh-CN, en;q=0.8")).toBe("zh");
        expect(resolveLocalePreference(undefined, null, undefined)).toBe("en");
    });

    it("reads only the named cookie and safely handles malformed encoding", () => {
        expect(readLocaleCookie(`other=1; ${LOCALE_COOKIE_NAME}=zh%2DCN; last=2`)).toBe("zh");
        expect(readLocaleCookie(`not_${LOCALE_COOKIE_NAME}=zh`)).toBeUndefined();
        expect(readLocaleCookie(`${LOCALE_COOKIE_NAME}=%E0%A4%A`)).toBeUndefined();
        expect(readLocaleCookie(`${LOCALE_COOKIE_NAME}=xx`)).toBeUndefined();
        expect(readLocaleCookie("")).toBeUndefined();
    });

    it("writes a long-lived, site-wide same-site cookie and only sets Secure on HTTPS", () => {
        expect(localePreferenceCookie("zh-CN", false)).toBe(`${LOCALE_COOKIE_NAME}=zh; Path=/; Max-Age=31536000; SameSite=Lax`);
        expect(localePreferenceCookie("en", true)).toBe(`${LOCALE_COOKIE_NAME}=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure`);
        expect(() => localePreferenceCookie("en; other=value", false)).toThrow(RangeError);
        expect(readLocaleCookie(localePreferenceCookie("zh", true))).toBe("zh");
    });
});
