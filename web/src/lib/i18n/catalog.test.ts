import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import { defaultMapState } from "$lib/vendor/maplibre-layer-manager/layers";

function flatten(messages: Record<string, unknown>, prefix = ""): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(messages)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string") result[path] = value;
        else if (value && typeof value === "object" && !Array.isArray(value)) {
            Object.assign(result, flatten(value as Record<string, unknown>, path));
        }
    }
    return result;
}

type MessageElement = ReturnType<IntlMessageFormat["getAst"]>[number];

function argumentsOf(message: string, language: string): string[] {
    const names = new Set<string>();
    function visit(elements: MessageElement[]) {
        for (const element of elements) {
            if (element.type >= 1 && element.type <= 6 && "value" in element) names.add(element.value);
            if ("options" in element) for (const option of Object.values(element.options)) visit(option.value);
            if ("children" in element) visit(element.children);
        }
    }
    visit(new IntlMessageFormat(message, language).getAst());
    return [...names].sort();
}

const english = flatten(en);
const chinese = flatten(zh);

describe("Chinese translation completeness", () => {
    it("covers the complete English catalog without empty or untranslated English values", () => {
        expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
        for (const [key, value] of Object.entries(chinese)) {
            expect(value.trim(), key).not.toBe("");
            expect(value, key).toMatch(/\p{Script=Han}/u);
        }
    });

    it("keeps every message parseable and preserves ICU interpolation arguments", () => {
        for (const [key, value] of Object.entries(english)) {
            expect(argumentsOf(chinese[key], "zh"), key).toEqual(argumentsOf(value, "en"));
        }
    });

    it("covers dynamic map overlay and point-of-interest labels", () => {
        const keys = [
            ...Object.keys(defaultMapState.overlays),
            ...Object.keys(defaultMapState.pois),
            ...Object.values(defaultMapState.pois).flatMap((category) => Object.keys(category)),
        ];
        for (const key of keys) {
            expect(english[key], key).toBeTruthy();
            expect(chinese[key], key).toMatch(/\p{Script=Han}/u);
        }
    });

    it("covers literal translation keys referenced by application components and routes", () => {
        const sourceRoot = new URL("../../", import.meta.url);
        const missing: string[] = [];
        for (const path of readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })) {
            if (!/\.(svelte|ts)$/.test(path) || /\.(test|spec)\.ts$/.test(path)) continue;
            const source = readFileSync(join(sourceRoot.pathname, path), "utf8");
            for (const match of source.matchAll(/\$_\(\s*["']([^"']+)["']\s*(?=[,)])/g)) {
                if (!(match[1] in english) || !(match[1] in chinese)) missing.push(`${path}: ${match[1]}`);
            }
        }
        expect(missing).toEqual([]);
    });
});
