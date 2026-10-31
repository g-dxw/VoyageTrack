import { categories_index } from "$lib/stores/category_store";
import { subcategories_index } from "$lib/stores/subcategory_store";
import { trails_featured } from "$lib/stores/trail_store";
import type { PageLoad } from "./$types";

// The homepage is public for every visitor. Personal data belongs to /dashboard.
export const load: PageLoad = async ({ fetch }) => {
    const [categories, subcategories, featured] = await Promise.allSettled([
        categories_index(fetch),
        subcategories_index(fetch),
        trails_featured(fetch),
    ]);

    for (const result of [categories, subcategories]) {
        if (result.status === "rejected" && !(result.reason instanceof Error && result.reason.message === "Unauthorized")) {
            console.error("Could not load homepage supporting data");
        }
    }

    return {
        featuredTrails: featured.status === "fulfilled" ? featured.value : [],
        featuredTrailsUnavailable: featured.status === "rejected",
    };
};
