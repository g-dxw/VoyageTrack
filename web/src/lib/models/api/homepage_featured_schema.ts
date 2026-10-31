import { z } from "zod";
import { MAX_HOMEPAGE_FEATURED, MAX_HOMEPAGE_REASON } from "../homepage_featured";

const reasonText = z.string().trim().refine(value => Array.from(value).length <= MAX_HOMEPAGE_REASON);
export const HomepageFeaturedEntrySchema = z.object({
    id: z.string().regex(/^[a-zA-Z0-9]{15}$/),
    reason: z.object({ en: reasonText, zh: reasonText }).strict().optional(),
}).strict();
const items = z.array(HomepageFeaturedEntrySchema).max(MAX_HOMEPAGE_FEATURED).superRefine((entries, ctx) => {
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "duplicate_trail" });
    }
});
export const HomepageFeaturedPublicSchema = z.object({ items }).strict();
export const HomepageFeaturedConfigSchema = z.object({
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    items,
}).strict();
export const HomepageEditorPermissionSchema = z.object({ canManageHomepage: z.boolean() }).strict();
