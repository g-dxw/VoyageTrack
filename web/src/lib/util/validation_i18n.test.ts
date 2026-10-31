import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import en from "$lib/i18n/locales/en.json";
import zh from "$lib/i18n/locales/zh.json";
import { translateValidationError } from "./validation_i18n";

const translate = (language: "en" | "zh") => (key: string, options?: { values: Record<string, number> }) => {
    const messages: Record<string, string | object> = language === "zh" ? zh : en;
    return typeof messages[key] === "string" ? String(new IntlMessageFormat(messages[key], language).format(options?.values)) : key;
};

describe("localized form validation", () => {
    it.each([
        [z.string(), undefined, "必填"],
        [z.string().email(), "not-an-email", "邮箱"],
        [z.string().url(), "not-a-url", "网址"],
        [z.string().url().or(z.literal("")), "not-a-url", "网址"],
        [z.union([z.string(), z.number()]), false, "有效"],
        [z.string().min(8), "short", "8"],
        [z.string().max(72), "x".repeat(73), "72"],
        [z.number(), NaN, "数字"],
        [z.number().min(-90), -91, "-90"],
        [z.number().max(180), 181, "180"],
    ])("translates actual Zod errors without modifying their API messages", (schema, value, expected) => {
        const result = schema.safeParse(value);
        expect(result.success).toBe(false);
        if (result.success) return;
        const message = result.error.issues[0].message;
        const localized = translateValidationError([message], translate("zh"));
        expect(localized).toContain(expected);
        expect(localized).toMatch(/\p{Script=Han}/u);
        expect(result.error.issues[0].message).toBe(message);
    });

    it("keeps language switching, existing keys and already localized messages working", () => {
        expect(translateValidationError("required", translate("zh"))).toBe(zh.required);
        expect(translateValidationError("Required", translate("en"))).toBe(en.required);
        expect(translateValidationError("请输入您的路线名称", translate("zh"))).toBe("请输入您的路线名称");
        expect(translateValidationError("Custom validation message", translate("en"))).toBe("Custom validation message");
        expect(translateValidationError([], translate("zh"))).toBe("");
        expect(translateValidationError(null, translate("zh"))).toBe("");
        expect(translateValidationError("toString", (key) => key)).toBe("toString");
        expect(translateValidationError("constructor", (key) => key)).toBe("constructor");
    });
});
