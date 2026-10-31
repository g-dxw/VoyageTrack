import { HomepageEditorPermissionSchema, HomepageFeaturedConfigSchema } from "$lib/models/api/homepage_featured_schema";
import type { FeaturedTrail } from "$lib/models/featured_trail";
import type { HomepageFeaturedAdminConfig, HomepageFeaturedConfig } from "$lib/models/homepage_featured";
import type { Trail } from "$lib/models/trail";
import { Collection } from "$lib/util/api_util";
import { error, isHttpError, json, redirect, type RequestEvent } from "@sveltejs/kit";
import PocketBase, { ClientResponseError, type ListResult } from "pocketbase";
import { loadHomepageFeaturedTrails } from "./homepage_featured";

export const homepageAdminHeaders = { "cache-control": "private, no-store", vary: "Cookie, Authorization" };
const messages = new Set([
    "homepage_auth_required", "homepage_editor_required", "homepage_unavailable", "homepage_invalid_request",
    "homepage_invalid_revision", "homepage_too_many_items", "homepage_duplicate_trail", "homepage_invalid_reason",
    "homepage_invalid_trail", "homepage_revision_conflict", "homepage_invalid_origin",
]);

export async function homepageEditorPermission(pb: PocketBase): Promise<boolean> {
    return HomepageEditorPermissionSchema.parse(await pb.send("/homepage/editor", { method: "GET", requestKey: null })).canManageHomepage;
}

export async function requireHomepageEditor(event: Pick<RequestEvent, "locals" | "url">, page = false) {
    const { locals } = event;
    if (!locals.user?.id || !locals.pb.authStore.isValid || locals.pb.authStore.record?.id !== locals.user.id) {
        if (page) redirect(303, `/login?r=${encodeURIComponent(event.url.pathname + event.url.search)}`);
        error(401, "homepage_auth_required");
    }
    if (!await homepageEditorPermission(locals.pb)) error(403, "homepage_editor_required");
}

export function homepageSelectionWithTrails(config: HomepageFeaturedConfig, trails: readonly FeaturedTrail[]): HomepageFeaturedAdminConfig {
    const byID = new Map(trails.map(entry => [entry.trail.id, entry]));
    return { revision: config.revision, items: config.items.map(entry => ({ ...entry, ...(byID.has(entry.id) ? { featured: byID.get(entry.id) } : {}) })) };
}

export async function enrichHomepageSelection(baseURL: string, config: HomepageFeaturedConfig): Promise<HomepageFeaturedAdminConfig> {
    return homepageSelectionWithTrails(config, await loadHomepageFeaturedTrails(baseURL, config.items));
}

export async function loadHomepageAdminConfig(pb: PocketBase): Promise<HomepageFeaturedAdminConfig> {
    const config = HomepageFeaturedConfigSchema.parse(await pb.send("/homepage/admin/featured", { method: "GET", requestKey: null }));
    return enrichHomepageSelection(pb.baseURL, config);
}

export async function homepageCandidates(baseURL: string, url: URL): Promise<ListResult<FeaturedTrail>> {
    const rawPage = url.searchParams.get("page") ?? "1";
    const page = /^[1-9]\d*$/.test(rawPage) && Number.isSafeInteger(Number(rawPage)) && Number(rawPage) <= 2147483647 ? Number(rawPage) : 1;
    const query = (url.searchParams.get("q") ?? "").trim();
    if (Array.from(query).length > 120) error(400, "homepage_invalid_request");
    const pb = new PocketBase(baseURL);
    const response = await pb.collection(Collection.trails).getList<Trail>(page, 20, {
        filter: pb.filter("public = true && name != ''" + (query ? " && name ~ {:query}" : ""), { query }),
        sort: "-created,-id", expand: "author,category,subcategory", requestKey: null,
    });
    // GetOne verifies the anonymous ViewRule too, independently of ListRule.
    const verified = await loadHomepageFeaturedTrails(baseURL, response.items.flatMap(trail => trail.id ? [{ id: trail.id }] : []));
    const byID = new Map(verified.map(entry => [entry.trail.id, entry]));
    const items = response.items.flatMap(trail => {
        const entry = trail.id ? byID.get(trail.id) : undefined;
        return entry ? [entry] : [];
    });
    return { ...response, items };
}

export function homepageAdminFailure(cause: unknown): Response {
    let status = 503;
    let message = "homepage_unavailable";
    if (cause instanceof ClientResponseError && [400, 401, 403, 409].includes(cause.status)) {
        status = cause.status;
        const key: unknown = cause.response?.message;
        if (typeof key === "string" && messages.has(key)) message = key;
    } else if (isHttpError(cause) && messages.has(cause.body.message)) {
        status = cause.status;
        message = cause.body.message;
    }
    return json({ message }, { status, headers: homepageAdminHeaders });
}
