import { loadHomepageFeaturedTrails } from "$lib/server/homepage_featured";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// Visibility can change at any time. Never serve an earlier public record after
// it has been removed or made private, including from a signed-in browser cache.
const headers = { "Cache-Control": "no-store" };

export const GET: RequestHandler = async ({ locals }) => {
    try {
        return json(await loadHomepageFeaturedTrails(locals.pb.baseURL), { headers });
    } catch {
        console.error("Could not load homepage featured trails");
        return json({ message: "featured_trails_unavailable" }, { status: 503, headers });
    }
};
