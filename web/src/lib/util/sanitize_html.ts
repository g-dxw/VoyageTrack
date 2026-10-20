import DOMPurify from "isomorphic-dompurify";

const twoStepsImageURL = /^https:\/\/down-files\.2bulu\.com\/f\/[A-Za-z0-9/?=&%+._~-]+$/;
const forbiddenContentTags = ["style", "form", "input", "button", "select", "textarea"];
const remoteMediaTags = ["img", "picture", "source", "video", "audio", "track", "iframe", "object", "embed"];
const remoteMediaAttributes = ["style", "background", "srcset", "sizes", "poster"];

function sanitizeWithImagePolicy(value: unknown, allowWaypointImages: boolean): string {
    return DOMPurify.sanitize(typeof value === "string" ? value : "", {
        USE_PROFILES: { html: true },
        FORBID_TAGS: [
            ...forbiddenContentTags,
            ...remoteMediaTags.filter((tag) => !allowWaypointImages || tag !== "img"),
        ],
        FORBID_ATTR: remoteMediaAttributes,
    });
}

// The same parser-backed sanitizer runs during SSR and immediately before
// rendering cached/provider content in the browser. Sanitize after Markdown.
export function sanitizeHTML(value: unknown): string {
    return sanitizeWithImagePolicy(value, false);
}

// Waypoint descriptions may contain photos exported by Two Steps. Keep that
// narrow compatibility exception without allowing arbitrary remote images to
// become tracking requests in a map popup or an unsaved import preview.
export function sanitizeWaypointHTML(value: unknown): string {
    const removeUntrustedImage = (node: Node) => {
        if (node.nodeName.toLowerCase() !== "img") {
            return;
        }
        const src = (node as Element).getAttribute("src") ?? "";
        if (!twoStepsImageURL.test(src)) {
            node.parentNode?.removeChild(node);
            return;
        }
        for (const attribute of [...(node as Element).attributes]) {
            if (attribute.name !== "src" && attribute.name !== "alt") {
                (node as Element).removeAttribute(attribute.name);
            }
        }
    };

    DOMPurify.addHook("uponSanitizeElement", removeUntrustedImage);
    try {
        return sanitizeWithImagePolicy(value, true);
    } finally {
        DOMPurify.removeHook("uponSanitizeElement");
    }
}
