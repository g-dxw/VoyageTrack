import type { FeaturedTrail } from "$lib/models/featured_trail";
import type { HomepageFeaturedEntry } from "$lib/models/homepage_featured";
import { HomepageFeaturedPublicSchema } from "$lib/models/api/homepage_featured_schema";
import type { Trail } from "$lib/models/trail";
import { Collection } from "$lib/util/api_util";
import PocketBase, { ClientResponseError } from "pocketbase";

export function homepageFeaturedTrail(trail: Trail, entry: HomepageFeaturedEntry): FeaturedTrail | undefined {
    const author = trail.expand?.author;
    if (trail.id !== entry.id || trail.public !== true || !trail.name?.trim() ||
        !author?.preferred_username?.trim() || typeof author.is_local !== "boolean" ||
        (!author.is_local && !author.domain?.trim())) return undefined;
    const handle = `@${encodeURIComponent(author.preferred_username)}${author.is_local ? "" : `@${encodeURIComponent(author.domain ?? "")}`}`;
    return { trail, href: `/trail/view/${handle}/${entry.id}`, ...(entry.reason ? { reason: entry.reason } : {}) };
}

/** Both configuration and current records are read anonymously, for every visitor. */
export async function loadHomepageFeaturedTrails(
    baseURL: string,
    entries?: readonly HomepageFeaturedEntry[],
): Promise<FeaturedTrail[]> {
    const publicClient = new PocketBase(baseURL);
    try {
        const selected = entries ?? HomepageFeaturedPublicSchema.parse(
            await publicClient.send("/homepage/featured", { method: "GET", requestKey: null }),
        ).items;
        const seen = new Set<string>();
        const unique = selected.filter(({ id }) => {
            if (!/^[a-zA-Z0-9]{15}$/.test(id) || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
        const results = await Promise.all(unique.map(async entry => {
            try {
                const trail = await publicClient.collection(Collection.trails).getOne<Trail>(entry.id, {
                    expand: "author,category,subcategory", requestKey: null,
                });
                return homepageFeaturedTrail(trail, entry);
            } catch (error) {
                if (error instanceof ClientResponseError && [403, 404].includes(error.status)) return undefined;
                throw error;
            }
        }));
        return results.filter((entry): entry is FeaturedTrail => entry !== undefined);
    } catch {
        throw new Error("featured_trails_unavailable");
    }
}
