import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import { localizeAboutMarkdown } from "./about";

const bundledAbout = readFileSync(new URL("../../../static/md/about.md", import.meta.url), "utf8");

describe("localized built-in About content", () => {
    it("keeps the English catalog aligned with the replaceable bundled Markdown", () => {
        expect(en["about-content"].trim()).toBe(bundledAbout.trim());
    });

    it("translates the bundled text, including line-ending and trailing-whitespace differences", () => {
        expect(localizeAboutMarkdown(bundledAbout, zh["about-content"])).toBe(zh["about-content"]);
        expect(localizeAboutMarkdown(`\n${bundledAbout.replace(/\n/g, "\r\n")}\r\n`, zh["about-content"]))
            .toBe(zh["about-content"]);
    });

    it("shows translated built-in content before loading and when the custom file cannot be fetched", () => {
        expect(localizeAboutMarkdown(null, zh["about-content"])).toBe(zh["about-content"]);
    });

    it.each(["# Our hiking club\n\nOur own introduction.", "俱乐部自定义介绍", ""])
        ("preserves administrator-provided content verbatim: %s", (customContent) => {
            expect(localizeAboutMarkdown(customContent, zh["about-content"])).toBe(customContent);
        });
});
