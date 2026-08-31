import type { StyleSpecification } from "maplibre-gl";
import type { BaseLayer } from "./layers";

export class TerrainLayer implements BaseLayer {
    spec: StyleSpecification;

    constructor(
        terrainURL: string,
        hillshadingURL?: string,
        bounds?: [number, number, number, number],
    ) {
        const hillshadingEnabled = Boolean(hillshadingURL);

        this.spec = {
            version: 8,
            name: "terrain",
            sources: {
                terrain: {
                    type: "raster-dem",
                    url: terrainURL,
                    bounds,
                },
                ...(hillshadingEnabled ? {
                    hillshading: {
                        type: "raster-dem",
                        url: hillshadingURL,
                        bounds,
                    }
                } : {})

            },
            layers: hillshadingEnabled ? [{
                id: "hillshading",
                source: "hillshading",
                type: "hillshade",
                layout: {
                    visibility: "none",
                },
            }] : []

        }

    }
}
