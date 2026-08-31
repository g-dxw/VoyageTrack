export type SandboxBounds = [number, number, number, number];

const MAX_MERCATOR_LATITUDE = 85.051129;

export function padSandboxBounds(
    [west, south, east, north]: SandboxBounds,
    ratio = 0.2,
    minimumPadding = 0.01,
): SandboxBounds {
    const longitudePadding = Math.max((east - west) * ratio, minimumPadding);
    const latitudePadding = Math.max((north - south) * ratio, minimumPadding);

    return [
        Math.max(-180, west - longitudePadding),
        Math.max(-MAX_MERCATOR_LATITUDE, south - latitudePadding),
        Math.min(180, east + longitudePadding),
        Math.min(MAX_MERCATOR_LATITUDE, north + latitudePadding),
    ];
}
