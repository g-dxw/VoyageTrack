import type { Trail } from "./trail";

export interface FeaturedTrailReason {
    en: string;
    zh: string;
}

export interface FeaturedTrail {
    trail: Trail;
    href: string;
    reason?: FeaturedTrailReason;
}
