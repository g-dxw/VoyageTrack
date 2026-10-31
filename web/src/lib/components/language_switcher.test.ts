import { render } from "svelte/server";
import { addMessages, init, locale } from "svelte-i18n";
import { beforeAll, describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "$lib/i18n/locales";
import LanguageSwitcher from "./language_switcher.svelte";

beforeAll(() => {
    addMessages("zh", { language: "语言" });
    addMessages("en", { language: "Language" });
    init({ fallbackLocale: "en", initialLocale: "zh" });
});

describe("header language switcher", () => {
    it("renders a labeled native select with Chinese first and English second", () => {
        locale.set("zh");
        const { body } = render(LanguageSwitcher);

        expect(body).toContain('<select name="language" aria-label="语言"');
        expect(body).toContain('aria-hidden="true"');
        expect(body).toContain('value="zh" lang="zh" selected="">中文</option>');
        expect(body).toContain('value="en" lang="en">English</option>');
        expect(body.indexOf('value="zh"')).toBeLessThan(body.indexOf('value="en"'));
    });

    it("preserves every supported language using native-language display names", () => {
        const { body } = render(LanguageSwitcher);
        const values = [...body.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);

        expect(values).toHaveLength(SUPPORTED_LOCALES.length);
        expect(new Set(values)).toEqual(new Set(SUPPORTED_LOCALES));
        expect(body).toContain('lang="de">Deutsch</option>');
        expect(body).toContain('lang="fr">français</option>');
    });

    it("reflects the active locale in both selection and the accessible label", () => {
        locale.set("en");
        const { body } = render(LanguageSwitcher);

        expect(body).toContain('aria-label="Language"');
        expect(body).toContain('value="en" lang="en" selected="">English</option>');
        expect(body).not.toContain('value="zh" lang="zh" selected');
    });
});
