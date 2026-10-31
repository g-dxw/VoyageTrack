import type { FeaturedTrail, FeaturedTrailReason } from "./featured_trail";

export const MAX_HOMEPAGE_FEATURED = 12;
export const MAX_HOMEPAGE_REASON = 240;
export interface HomepageFeaturedEntry {
    id: string;
    reason?: FeaturedTrailReason;
}
export interface HomepageFeaturedConfig {
    revision: number;
    items: HomepageFeaturedEntry[];
}
export interface HomepageFeaturedSelection extends HomepageFeaturedEntry {
    featured?: FeaturedTrail;
}
export interface HomepageFeaturedAdminConfig {
    revision: number;
    items: HomepageFeaturedSelection[];
}
