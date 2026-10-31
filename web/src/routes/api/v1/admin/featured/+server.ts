import { HomepageFeaturedConfigSchema } from "$lib/models/api/homepage_featured_schema";
import { enrichHomepageSelection, homepageAdminFailure, homepageAdminHeaders, loadHomepageAdminConfig, homepageSelectionWithTrails, requireHomepageEditor } from "$lib/server/homepage_admin";
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async event => {
    try {
        await requireHomepageEditor(event);
        return json(await loadHomepageAdminConfig(event.locals.pb), { headers: homepageAdminHeaders });
    } catch (cause) { return homepageAdminFailure(cause); }
};
export const PUT: RequestHandler = async event => {
    try {
        await requireHomepageEditor(event);
        if (event.request.headers.get("origin") !== event.url.origin) error(403, "homepage_invalid_origin");
        if (event.request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") error(400, "homepage_invalid_request");
        const text = await event.request.text();
        if (new TextEncoder().encode(text).byteLength > 65536) error(400, "homepage_invalid_request");
        let body: unknown;
        try { body = JSON.parse(text); } catch { error(400, "homepage_invalid_request"); }
        const parsed = HomepageFeaturedConfigSchema.safeParse(body);
        if (!parsed.success) error(400, "homepage_invalid_request");
        // Resolve display metadata before committing. A failed post-commit read
        // must not turn a successful save into a misleading "save failed" result.
        const selection = await enrichHomepageSelection(event.locals.pb.baseURL, parsed.data);
        const config = HomepageFeaturedConfigSchema.parse(await event.locals.pb.send("/homepage/admin/featured", {
            method: "PUT", body: parsed.data, requestKey: null,
        }));
        const trails = selection.items.flatMap(entry => entry.featured ? [entry.featured] : []);
        return json(homepageSelectionWithTrails(config, trails), { headers: homepageAdminHeaders });
    } catch (cause) { return homepageAdminFailure(cause); }
};
