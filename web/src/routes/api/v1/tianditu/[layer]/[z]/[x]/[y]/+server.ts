import { error, type RequestEvent } from "@sveltejs/kit";
import { TIANDITU_API_KEY } from "$lib/config/map";

const TIANDITU_TILE_HOST = "https://t0.tianditu.gov.cn";
const TIANDITU_LAYERS: Record<string, string> = {
    vec_w: "vec",
    img_w: "img",
    cia_w: "cia",
};

function isTileCoordinate(value: string | undefined): value is string {
    return value !== undefined && /^\d+$/.test(value);
}

export async function GET(event: RequestEvent) {
    const { layer, z, x, y } = event.params;
    const tiandituLayer = layer ? TIANDITU_LAYERS[layer] : undefined;

    if (
        !tiandituLayer ||
        !isTileCoordinate(z) ||
        !isTileCoordinate(x) ||
        !isTileCoordinate(y)
    ) {
        throw error(400, "Invalid Tianditu tile coordinates");
    }

    const apiKey = event.locals.settings?.tiandituKey?.trim() || TIANDITU_API_KEY;
    if (!apiKey) {
        throw error(503, "Tianditu API key is not configured");
    }

    const url = new URL(`/${layer}/wmts`, TIANDITU_TILE_HOST);
    url.search = new URLSearchParams({
        SERVICE: "WMTS",
        REQUEST: "GetTile",
        VERSION: "1.0.0",
        LAYER: tiandituLayer,
        STYLE: "default",
        TILEMATRIXSET: "w",
        FORMAT: "tiles",
        TILEMATRIX: z,
        TILEROW: y,
        TILECOL: x,
        tk: apiKey,
    }).toString();

    try {
        const response = await event.fetch(url.toString(), {
            headers: {
                Accept: "image/*",
                "User-Agent":
                    event.request.headers.get("user-agent") ||
                    "Mozilla/5.0",
                Origin: event.url.origin,
                Referer: `${event.url.origin}/`,
                "Sec-Fetch-Dest": "image",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "cross-site",
            },
        });
        const headers = new Headers();
        const contentType = response.headers.get("content-type");
        if (contentType) {
            headers.set("content-type", contentType);
        }
        headers.set("cache-control", "public, max-age=86400");

        return new Response(response.body, {
            status: response.status,
            headers,
        });
    } catch (cause) {
        console.error("Tianditu tile request failed", cause);
        throw error(502, "Tianditu tile request failed");
    }
}
