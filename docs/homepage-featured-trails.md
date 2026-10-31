# Managing homepage featured trails

The public homepage reads an ordered selection persisted in PocketBase. Anonymous and signed-in visitors see the same public routes; personal public/private routes remain in `/dashboard`. No source-code change is needed to update the selection.

## Grant a homepage editor

Use an existing ordinary VoyageTrack account (password or Logto login). A PocketBase superuser grants access through the controlled PocketBase management interface by adding a `homepage_editors` record with that account's `user` relation. Remove the record to revoke access immediately. This collection has no ordinary record API permissions: a user cannot grant themselves access.

The PocketBase superuser account is separate from a website account. Do not place superuser credentials in the Web app or browser session. Production PocketBase may only be reachable through its existing protected loopback/tunnel; publishing a new public database administration endpoint is unnecessary.

## Select, order and save

1. Sign in with the authorized website account. Open **Homepage featured trails / 首页精选管理** from the user menu, or go to `/admin/featured`.
2. Search by route name. The candidate list contains public routes independently of your personal hidden-category preferences. Open a detail link to check the actual route/photos.
3. Add the routes you want to show, up to 12. Use **Move up / Move down** to set homepage order. Remove a selection to stop displaying it; this does not delete the original route.
4. Optionally add factual recommendation reasons in Chinese and English, up to 240 characters per language. Blank reasons are allowed.
5. Click **Save selection**. Until a successful save, the page is a draft; search and pagination do not discard it. The saved selection survives refresh and service restarts. An empty list is a valid intentional empty homepage.
6. If another editor has saved since you opened the page, the save returns a conflict and keeps your draft. **Discard draft and load latest** explicitly replaces it with the current saved version.

A previously selected route that has become private, deleted or unavailable is marked unavailable in the editor and can be removed. Invalid/unavailable entries cannot be newly saved.

## Privacy and operational behavior

`GET /api/v1/trail/featured` remains the Web public endpoint. The Go backend reads `homepage_featured` and filters the saved entries using `public=true` and a fresh anonymous ViewRule check with no auth or share query. The Web server then reads current records with a fresh anonymous PocketBase client to validate the author and build existing detail links. A private/removed/denied route and its reason are omitted even for signed-in owners.

Responses use `Cache-Control: no-store`. Backend/configuration failures are distinct from a valid empty list; unavailable services never become a fabricated selection. The initial migration creates an empty list and grants no editor automatically. A fresh install needs the backend migration before the updated Web app can read the saved configuration.

Native `homepage_featured` and `homepage_editors` APIs are locked to PocketBase superusers. Authorized website editors use `/homepage/admin/featured` behind the Web API; permission is checked again inside the write transaction. A revision protects against silent overwrites. The browser write proxy also requires a matching Origin.

## Verification and rollback

Run backend `go fmt ./...`, `go vet ./...`, `go test ./...`, then Web check/unit/build. Real permission tests use temporary databases; browser admin fixtures require their dedicated loopback environment and explicit fixture opt-in, never a production/shared database.

Back up PocketBase before applying the new migration. Rolling that migration back removes both the saved homepage selection and editor grants; restore the backup to recover them. No route content is changed by selecting or removing a feature.
