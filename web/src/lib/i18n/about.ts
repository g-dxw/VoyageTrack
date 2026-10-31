import en from "./locales/en.json";

/** Translate bundled copy while leaving administrator-provided Markdown intact. */
export function localizeAboutMarkdown(markdown: string | null, translatedDefault: string): string {
    if (markdown === null || normalize(markdown) === normalize(en["about-content"])) {
        return translatedDefault;
    }
    return markdown;
}

function normalize(markdown: string): string {
    return markdown.replace(/\r\n/g, "\n").trim();
}
