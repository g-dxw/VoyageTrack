import { render } from "svelte/server";
import { addMessages, init } from "svelte-i18n";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultMapState } from "$lib/vendor/maplibre-layer-manager/layers";
import StyleSwitcher from "./style_switcher.svelte";

beforeAll(() => {
    addMessages("zh", {
        "map-style": "地图样式",
        "map-style-tianditu": "天地图",
        "toggle-map-style": "切换地图样式",
        close: "关闭",
    });
    init({ fallbackLocale: "zh", initialLocale: "zh" });
});

describe("map style switcher localization", () => {
    it("displays translated names while keeping the persisted style identifier", () => {
        const { body } = render(StyleSwitcher, {
            props: {
                settings: {
                    styles: { Tianditu: "/styles/tianditu", "Custom style": "/styles/custom" },
                    state: { ...defaultMapState, base: "Tianditu" },
                    onchange: () => {},
                },
            },
        });

        expect(body).toContain("天地图");
        expect(body).toContain('aria-label="切换地图样式"');
        expect(body.match(/<input[^>]*value="Tianditu"[^>]*>/)?.[0]).toContain("checked");
        expect(body).toContain('value="Custom style"');
        expect(body).not.toContain('value="天地图"');
    });
});
