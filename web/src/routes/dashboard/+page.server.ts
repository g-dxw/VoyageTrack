import type { Trail } from "$lib/models/trail";
import { Collection } from "$lib/util/api_util";
import { isRedirect, redirect } from "@sveltejs/kit";
import type { ListResult } from "pocketbase";
import type { PageServerLoad } from "./$types";

const perPage = 12;

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
    setHeaders({
        "cache-control": "private, no-store",
        vary: "Cookie, Authorization",
    });

    const user = locals.user;
    if (
        !user?.id || !locals.pb.authStore.isValid ||
        locals.pb.authStore.record?.id !== user.id
    ) {
        redirect(303, `/login?r=${encodeURIComponent(url.pathname + url.search)}`);
    }

    const pageInput = url.searchParams.get("page") ?? "1";
    const parsedPage = /^[1-9]\d*$/.test(pageInput) ? Number(pageInput) : 1;
    const page = Number.isSafeInteger(parsedPage) && parsedPage <= 2_147_483_647 ? parsedPage : 1;
    const emptyTrails: ListResult<Trail> = {
        items: [], page, perPage, totalItems: 0, totalPages: 0,
    };
    const failed = { trails: emptyTrails, trailLinks: {} as Record<string, string>, loadError: true };
    const actor: unknown = user.actor;
    if (typeof actor !== "string" || !/^[a-zA-Z0-9]{15}$/.test(actor)) {
        return failed;
    }

    try {
        // This is the complete owner library, including private trails and
        // hidden categories. Public search/preferences must not narrow it.
        const trails = await locals.pb.collection(Collection.trails).getList<Trail>(page, perPage, {
            filter: locals.pb.filter("author = {:actor}", { actor }),
            sort: "-created,-id",
            expand: "author,category,subcategory",
            requestKey: null,
        });
        const lastPage = Math.max(1, trails.totalPages);
        if (page > lastPage) {
            const correctedURL = new URL(url);
            correctedURL.searchParams.set("page", lastPage.toString());
            redirect(303, correctedURL.pathname + correctedURL.search);
        }
        const trailLinks: Record<string, string> = {};
        for (const trail of trails.items) {
            if (trail.author !== actor || !trail.id) {
                throw new Error("Unexpected trail ownership");
            }
            const expandedAuthor = trail.expand?.author;
            const username = expandedAuthor?.preferred_username || user.username;
            if (typeof username !== "string" || !username.trim()) {
                throw new Error("Missing trail author handle");
            }
            const domain = expandedAuthor && !expandedAuthor.is_local ? expandedAuthor.domain : undefined;
            const handle = `@${encodeURIComponent(username)}${domain ? `@${encodeURIComponent(domain)}` : ""}`;
            trailLinks[trail.id] = `/trail/view/${handle}/${trail.id}`;
        }
        return { trails, trailLinks, loadError: false };
    } catch (error) {
        if (isRedirect(error)) throw error;
        console.error("Could not load dashboard trails");
        return failed;
    }
};
