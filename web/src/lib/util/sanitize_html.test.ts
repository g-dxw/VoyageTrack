import { describe, expect, it } from "vitest";
import { sanitizeHTML, sanitizeWaypointHTML } from "./sanitize_html";

describe("safe rich-text rendering", () => {
    it("keeps formatted international text and safe links", () => {
        const input = '<p>Grüezi <strong>山歩き 🚲</strong> &amp; friends</p><a class="mention" href="https://example.test/profile">@friend</a>';
        expect(sanitizeHTML(input)).toBe(input);
        expect(sanitizeHTML(sanitizeHTML(input))).toBe(sanitizeHTML(input));
    });

    it("sanitizes new and previously cached profile HTML on the server", () => {
        const input = '<p onclick="blocked()">Profile</p><img src="x" onerror="blocked()"><script>blocked()</script><a href="javascript:blocked()">Link</a>';
        const safe = sanitizeHTML(input);
        expect(safe).toContain("Profile");
        expect(safe).toContain("Link");
        expect(safe).not.toContain("<img");
        expect(safe).not.toMatch(/onclick|onerror|<script|javascript:|blocked\(\)/i);
    });

    it.each([
        '<svg><g onload="blocked()"></g></svg>',
        '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=blocked()>">',
        '<a href="&#x6a;avascript:blocked()">Link</a>',
        '<iframe srcdoc="<script>blocked()</script>"></iframe>',
    ])("rejects foreign namespaces and unsafe parser variants", (input) => {
        expect(sanitizeHTML(input)).not.toMatch(/<svg|<math|<iframe|<style|onerror=|onload=|href="javascript:/i);
    });

    it("does not render injected controls or inline styles", () => {
        expect(sanitizeHTML('<form><input name="password"><button>Submit</button></form><p style="position:fixed">Text</p>'))
            .not.toMatch(/<form|<input|<button|style=/i);
        expect(sanitizeHTML(null)).toBe("");
    });

    it("keeps only allow-listed Two Steps images in waypoint descriptions", () => {
        const trusted = "https://down-files.2bulu.com/f/d1?downParams=test%0A";
        const input = `<p>Photos</p>` +
            `<img src="${trusted}" alt="Waterfall" style="height:360px" onerror="blocked()">` +
            `<img src="https://example.test/tracker.png">` +
            `<img src="http://down-files.2bulu.com/f/insecure.png">`;

        const safe = sanitizeWaypointHTML(input);

        expect(safe).toContain(`src="${trusted}"`);
        expect(safe).toContain('alt="Waterfall"');
        expect(safe).not.toMatch(/example\.test|http:\/\/down-files|style=|onerror=|blocked\(\)/i);
        expect(safe.match(/<img/g)).toHaveLength(1);
    });

    it("does not narrow safe links while filtering waypoint images", () => {
        const input = '<a href="https://example.test/notes">Notes</a><img src="javascript:blocked()">';
        const safe = sanitizeWaypointHTML(input);

        expect(safe).toContain('href="https://example.test/notes"');
        expect(safe).not.toContain("<img");
    });

    it("rejects alternate image and media request attributes", () => {
        const trusted = "https://down-files.2bulu.com/f/photo.jpg";
        const input =
            `<img src="${trusted}" alt="Photo" srcset="https://example.test/tracker.png 2x" sizes="100vw">` +
            `<picture><source srcset="https://example.test/source.png"><img src="${trusted}"></picture>` +
            '<video poster="https://example.test/poster.png"><source src="https://example.test/video.mp4"></video>';

        const safe = sanitizeWaypointHTML(input);

        expect(safe).toBe(`<img src="${trusted}" alt="Photo"><img src="${trusted}">`);
        expect(safe).not.toMatch(/srcset|sizes|<picture|<source|<video|poster|example\.test/i);

        const legacyBackground = '<table background="https://example.test/background.png"><tbody><tr><td>Text</td></tr></tbody></table>';
        expect(sanitizeHTML(legacyBackground)).not.toContain("example.test");
        expect(sanitizeWaypointHTML(legacyBackground)).not.toContain("example.test");
    });
});
