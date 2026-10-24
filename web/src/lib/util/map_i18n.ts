type Translate = (key: string) => string;

const styleLabelKeys: Record<string, string> = {
    Tianditu: "map-style-tianditu",
    "Tianditu Satellite": "map-style-tianditu-satellite",
    "Carto Light": "map-style-carto-light",
    "Carto Dark": "map-style-carto-dark",
};

/** Keep persisted map-style identifiers and administrator-provided names intact. */
export function mapStyleLabel(style: string, translate: Translate): string {
    return Object.hasOwn(styleLabelKeys, style) ? translate(styleLabelKeys[style]) : style;
}

/** MapLibre's control messages are configured when the map is created. */
export function mapControlLocale(translate: Translate): Record<string, string> {
    return {
        "AttributionControl.ToggleAttribution": translate("map-toggle-attribution"),
        "AttributionControl.MapFeedback": translate("map-feedback"),
        "FullscreenControl.Enter": translate("map-enter-fullscreen"),
        "FullscreenControl.Exit": translate("map-exit-fullscreen"),
        "GeolocateControl.FindMyLocation": translate("map-find-location"),
        "GeolocateControl.LocationNotAvailable": translate("map-location-unavailable"),
        "LogoControl.Title": translate("map-logo"),
        "Map.Title": translate("map"),
        "Marker.Title": translate("map-marker"),
        "NavigationControl.ResetBearing": translate("map-reset-bearing"),
        "NavigationControl.ZoomIn": translate("map-zoom-in"),
        "NavigationControl.ZoomOut": translate("map-zoom-out"),
        "Popup.Close": translate("close"),
        "GlobeControl.Enable": translate("map-enable-globe"),
        "GlobeControl.Disable": translate("map-disable-globe"),
        "TerrainControl.Enable": translate("map-enable-terrain"),
        "TerrainControl.Disable": translate("map-disable-terrain"),
        "CooperativeGesturesHandler.WindowsHelpText": translate("map-zoom-windows-help"),
        "CooperativeGesturesHandler.MacHelpText": translate("map-zoom-mac-help"),
        "CooperativeGesturesHandler.MobileHelpText": translate("map-pan-mobile-help"),
    };
}
