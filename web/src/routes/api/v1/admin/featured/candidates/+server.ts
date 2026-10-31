import { homepageAdminFailure, homepageAdminHeaders, homepageCandidates, requireHomepageEditor } from "$lib/server/homepage_admin";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async event => {
    try {
        await requireHomepageEditor(event);
        return json(await homepageCandidates(event.locals.pb.baseURL, event.url), { headers: homepageAdminHeaders });
    } catch (cause) { return homepageAdminFailure(cause); }
};
