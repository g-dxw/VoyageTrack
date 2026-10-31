# Public Homepage and Personal User Center

## Product boundary
The open platform homepage `/` serves everyone, including signed-in users. It always shows the product introduction, island scene, public curated routes and exploration. It must not be a private activity feed. Signed-in header/home actions lead to `/dashboard`; profile pages remain public identity views.

## Personal data ownership
`/dashboard` is protected through shared authorization and its server load. Query with authenticated `locals.pb`; derive the only author filter from `locals.user.actor`. Never accept author/user IDs from URL input. Read the current PocketBase records with deterministic pagination, not a Meilisearch index or category-preference helper: all self-authored public and private trails, including hidden categories, belong in this list. Shared/other users' trails do not.

Set private,no-store for personal responses. Invalid/expired identity must not trigger an unscoped query. Backend failure is not an empty collection; show an explicit localized error. Keep existing Trail records and author relationship IDs intact, deriving detail handles from expanded authors/current identity and reusing TrailCard and Pagination.

## Navigation and compatibility
Provide explicit desktop and mobile user-center navigation and keep public profile/settings available. Default login return behavior and OAuth PKCE/storage contracts do not change as part of this separation. Existing explicit login return targets must continue to work.

## Verification
Unit tests cover anonymous protection, session author filter, ignored URL author, paging validation/stability and visible errors. Browser tests verify login does not replace public homepage content, no homepage feed request, center entries/links/pagination, private+public own trails and isolation from another user's trails. Create only uniquely named disposable local accounts/data, avoid verification emails and legacy shared Test-account setup/teardown, and clean test-owned data in finally. Never use production for these writes.
