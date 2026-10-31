# Homepage Public Featured Trails

## Scope
Use when changing the public homepage data loading, its curated trail list, cards or maintenance instructions. The platform homepage is the same for anonymous and signed-in visitors; keep its separate floating-island scene contract. Personal trails belong to `/dashboard`.

## Data and visibility contract
- The `homepage_featured` PocketBase singleton owns the ordered list of real record IDs and optional English/Chinese reasons, maintained through `/admin/featured`. The backend public `/homepage/featured` endpoint supplies the selection; array order is display order, with no random substitute or fabricated initial data.
- `/api/v1/trail/featured` reads current PocketBase records with a new anonymous client. Never reuse `event.locals.pb` authentication for the curated selection.
- A selected record must still be public, anonymously readable and have a usable expanded author. Deleted/private/unreadable records are skipped; actual upstream failures must not be presented as an authoritative empty selection.
- `FeaturedTrail` contains the existing `Trail`, its existing detail-route `href`, and optional bilingual reason. Preserve `trail.author` as the relationship ID and preserve PocketBase file metadata; derive the handle from expanded author data.
- No-store responses prevent a cached selection from continuing to expose a record that was unpublished. Revalidate by reading live records, rather than relying on search-index visibility.
- Homepage loads isolate featured and supporting taxonomy failures. The homepage must never load or render the signed-in feed, regardless of authentication state. One failed load cannot clear independently successful featured data.

## Presentation contract
Use actual names, locations and metrics; omit missing/non-finite metrics. Use existing file and unit-format helpers, compressed lazy images and an existing illustration on missing/failed media. Do not auto-play trail videos. Preserve a keyboard-accessible detail link and public browse entry in both empty/error states. Keep new copy in English and Chinese catalogs and preserve administrator About Markdown overrides.

## Validation
Unit tests must verify stable order, duplicate/missing/private/unreadable filtering, anonymous permissions, author hrefs and page-load failure isolation. Browser verification must exercise the actual hydrated homepage at desktop/mobile widths, both themes/languages, media failure, empty/error states, and the same public content after login. A signed-in call to action may link to the user center without replacing the page body. Browser route mocks cannot intercept server-side initial load: navigate from a hydrated real page and assert each intended fixture was requested. Use a dedicated local built Node server and avoid destructive account setup/teardown for this read-only flow.

## Maintenance
Follow `docs/homepage-featured-trails.md` to add, replace, reorder and remove entries. An empty list remains honest until real public content is selected.

## Approved monochrome layout (2026-10-31)
The homepage follows the approved black/white design with smaller typography: hero48px desktop/32px mobile, section28/22, card18, existing body15/16 and mobile input/control geometry preserved. Use existing typography tokens, not root zoom. Hero illustration remains naturally colored; UI chrome/tokens are neutral black/white/gray.

`+layout.svelte` scopes `.homepage-shell` and NavBar/Footer home variants by the pathname. Do not alter global theme or other-page branding/layout. The home header/footer use the native VoyageTrack wordmark, compact navigation and footer; language/theme/auth/dashboard capabilities remain available.

Place FloatingIsland inside the right hero slot, following its contained-scene contract. Featured cards occupy3 columns at desktop,2 at tablet,1 at mobile. An empty live list is a designed honest empty state, never the image mockup's fabricated route examples. The gray native-SVG invitation holds the existing sanitized administrator About content, anchors#about/#get-started and appropriate auth action. No generated entire-UI raster is used in the page and no extra animation clock is introduced.

Browser validation checks desktop/mobile alignment, three-column actual card fixtures, compact typography, monochrome light/dark controls and theme isolation after leaving home. Retain the default header80px/mobile72px and logo direct-child anchor structure used by navigation tests.

### Scoped color and stacking lessons
When overriding raw RGB tokens inside `.homepage-shell`, also redeclare their `--color-*` Tailwind aliases in that scope. Aliases declared on the root resolve there before inheritance; testing only raw variables or custom hero buttons misses old theme colors in `bg-background`, `bg-input-background` and header login utilities. Verify actual computed header/input/button colors in both themes and keep the inversion's label contrast.

The hero establishes isolation so its copy/controls do not compete at the same root z-index as the sticky header. Test scrolling the headline beneath the header and `elementFromPoint` hit ownership. The small eyebrow uses at least `.60` foreground alpha against the white surface (about4.69:1), preserving readable contrast after typography is reduced.

## Homepage editor boundary
`/admin/featured` and `/api/v1/admin/featured` are restricted to existing users authorized in the locked `homepage_editors` collection. Navigation uses a server-verified user-ID capability and compares it to the current client identity; hiding the link is presentation only. Every page/API request asks the backend permission service; writes are checked again transactionally by Go. Never accept a client/profile admin flag or put PB superuser credentials in the Web session.

`models/homepage_featured.ts` owns the shared entry/config/admin-selection types and limits; `models/api/homepage_featured_schema.ts` owns runtime payload validation. `server/homepage_admin.ts` owns authenticated management calls and anonymous hydration/candidates. Candidate searches use a fresh anonymous PB client with parameterized public/name filtering and no personal category preferences, then recheck ViewRule with getOne. A failed permission service is unavailable, not an authoritative denial/empty selection.

The page keeps a local draft across candidate search/pagination, saves atomically with revision, and retains the draft on failure/conflict. It exposes accessible up/down/remove controls, optional bilingual reasons, unavailable saved items, and an explicit discard-and-load-latest conflict action. New labels/errors are localized. Browser writes require same Origin; all admin responses are private/no-store. The neutral homepage token scope and VoyageTrack header/footer variants also cover the authorized admin page, while other routes retain their existing theme. Shared About links must return to /#about from the admin page. Keep the admin dropdown entry as a native focusable link so keyboard users can reach it; ordinary dropdown actions retain their existing behavior.
