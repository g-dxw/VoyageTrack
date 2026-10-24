import { describe, expect, it } from "vitest";
import { mapControlLocale, mapStyleLabel } from "./map_i18n";

describe("map display translations", () => {
    const translate = (key: string) => `translated:${key}`;

    it("translates built-in style labels without changing custom style names", () => {
        expect(mapStyleLabel("Tianditu Satellite", translate)).toBe(
            "translated:map-style-tianditu-satellite",
        );
        expect(mapStyleLabel("Carto Dark", translate)).toBe(
            "translated:map-style-carto-dark",
        );
        expect(mapStyleLabel("My custom terrain", translate)).toBe(
            "My custom terrain",
        );
        expect(mapStyleLabel("OpenFreeMap", translate)).toBe("OpenFreeMap");
        expect(mapStyleLabel("constructor", translate)).toBe("constructor");
        expect(mapStyleLabel("__proto__", translate)).toBe("__proto__");
    });

    it("provides MapLibre's namespaced accessibility and control messages", () => {
        const messages = mapControlLocale(translate);

        expect(messages["NavigationControl.ZoomIn"]).toBe("translated:map-zoom-in");
        expect(messages["GeolocateControl.LocationNotAvailable"]).toBe(
            "translated:map-location-unavailable",
        );
        expect(messages["Popup.Close"]).toBe("translated:close");
        expect(messages["Map.Title"]).toBe("translated:map");
        expect(messages["ScaleControl.Meters"]).toBeUndefined();
    });
});
