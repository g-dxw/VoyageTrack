import { homepageAdminHeaders, homepageCandidates, loadHomepageAdminConfig, requireHomepageEditor } from "$lib/server/homepage_admin";
import type { FeaturedTrail } from "$lib/models/featured_trail";
import { error, isHttpError, isRedirect } from "@sveltejs/kit";
import type { ListResult } from "pocketbase";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async event => {
    event.setHeaders(homepageAdminHeaders);
    try {
        await requireHomepageEditor(event, true);
        const selection = await loadHomepageAdminConfig(event.locals.pb);
        let candidates: ListResult<FeaturedTrail> = { items: [], page: 1, perPage: 20, totalPages: 0, totalItems: 0 };
        let candidateError = false;
        try { candidates = await homepageCandidates(event.locals.pb.baseURL, new URL(event.url.pathname, event.url)); }
        catch { candidateError = true; }
        return { selection, candidates, candidateError };
    } catch (cause) {
        if (isRedirect(cause) || isHttpError(cause)) throw cause;
        error(503, "homepage_unavailable");
    }
};
