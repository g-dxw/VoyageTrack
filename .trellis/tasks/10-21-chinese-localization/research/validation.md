# Validation

## Production delivery result (2026-10-24)

- PR31 merged from protected `dev` into `main`: `2302b1b6014000e7c1fc77e4b42ccb9b3b95e5c4`. Both dev/PR full CI succeeded after correcting obsolete localized selectors; GitHub logged all110 browser tests passing, plus572 unit tests/11 existing skips. The exact merged-main Go and Web checks also succeeded.
- `Deploy Production` run40085764879 completed successfully. All compilation/builds and publication ran in GitHub Actions. Production only pulled prebuilt artifacts, verified revisions, backed up PocketBase and recreated web/db. The mirrored Web image download was slow (228504481 compressed bytes; its single large application layer164672507 bytes), but continued progressing without stopping the previous healthy services prematurely.
- Independent SSH verification: `.release`, web image and db image all equal the full main SHA above; both OCI revision labels match. Web/db/search are healthy. Web remains bound to127.0.0.1:13000, PocketBase127.0.0.1:18090; search has no published host port. Loopback web200 and database health `ok`; both running services use the new HTTPS ORIGIN. Other pre-existing application containers remain healthy.
- Consistent pre-deploy database backup retained: `pb_data-20261024T110338968203459Z-3935b6c9a1ecc54a23fdb1576fcabdb818b8bef2.tar.gz` (7939653 bytes), with metadata mapping previous3935b6c9 to candidate2302b1b6. Runtime environment backup comparison confirmed only ORIGIN changed; secrets and data were preserved.
- Public trusted HTTPS returns200; HTTP redirects308 to the canonical HTTPS hostname. Dedicated TLS certificate expires2027-01-22, Certbot timer active, existing validated global Nginx renewal reload hook retained. No insecure TLS bypass was used.
- Public browser verification is read-only: no production account creation, deletion or settings writes. Initial cold-load checks exposed the test harness's5-second hydration limit: an independent desktop load reached zh-CN in12.5seconds and mobile in6.2seconds, with no requestfailed/pageerror. A follow-up diagnostic with explicit hydration readiness is being recorded separately; do not claim the original public5-second run was all green.
- Final public QA: original8-test run6passed/2timed out; retries also exposed the strict5-second hydration/30-second multi-page limits. Without changing source/tests or skipping CI checks, an explicit30-second readiness diagnostic verified Chinese/English switching, refresh persistence, English SSR, login-page switch back to Chinese, Secure/Lax preference cookie and mobile public home/login/register/trails/lists/map. Measured mobile header72px, search52px, editable controls44px, no horizontal overflow, map bottom within812px. Browser errors and production data writes were both empty. Initial desktop hydration12.5–15.3seconds/mobile5.1–6.2seconds; later navigations0.5–2.6seconds. JS returned200 with Brotli compression and one-year immutable caching, so no compression/cache configuration change was needed. Public screenshots captured and visually reviewed. Remaining limitation: first cold load over the production network is slower than local/CI; no authenticated production account or email/federation flow was exercised.
- The separate temporary local database/search containers, dedicated network, temporary Node previews3310/3311 and generated test-only auth state have been cleaned up. Existing local services/data were not removed.

## Authorized production release preflight (2026-10-24)

### Full-suite compatibility follow-up

- PR31's Go/deployment/source checks passed. Web CI exposed additional legacy selectors still expecting old accessible names; the two obsolete Web runs were cancelled rather than bypassed. Updated editor/pagination fixtures to literal translation keys, and real list page objects to the English catalog's menu/cover/empty-state names. Homepage error checking now validates the document status rather than only an obsolete English error phrase.
- All82 component browser tests passed in production mode. The suspected registration error-toast translation mismatch was disproved by its actual random-account regression: failed language saving leaves account language English, so the original English assertion correctly passes and remains unchanged.
- Added suite-wide `WANDERER_TEST_BASE_URL` support (default remains CI's localhost3000). Created separate temporary in-memory PocketBase/Meilisearch containers for full-suite execution, with no existing local/production database mounted. Initial full run:107 passed, homepage positive assertion needed a wrapper-independent locator, location search failed because this host cannot fetch external Nominatim, and dependent teardown did not run. No test was weakened or skipped in CI; the corrected full CI remains the release gate.

- User authorized latest-code deployment to `track.cqaiclub.online`, explicitly superseding earlier local-only scope. DNS A verified as `49.234.192.148`. Existing production release was `3935b6c9a1ecc54a23fdb1576fcabdb818b8bef2`; protected main and required `check-source`, `db-test`, `deployment-contracts`, `test` remain enforced for administrators.
- Added separate hostname HTTP/TLS templates and expanded Nginx contract tests. Dedicated certificate issued (expires 2027-01-22), HTTP returns308 to HTTPS, public trusted HTTPS returns200. Initial ACME secondary-region timeout resolved on one bounded retry without firewall changes.
- Backed up HTTP bootstrap and root-only runtime environment under `/srv/apps/voyagetrack/backups/domain-20261024/`. Only production `.env` ORIGIN changed to `https://track.cqaiclub.online`; runtime secrets/data/other services unchanged. Existing active certbot timer and global validated Nginx reload hook retained.
- Full local production-mode pre-release verification: svelte-check0errors/0warnings;572 unit tests passed/11 existing skips; production build passed; all51 focused browser tests passed against built Node app3310 using isolated Colima backend/search. Random UI test accounts cleaned up. New test harness fixes additionally passed5/5 in Vite and5/5 in production. Nginx/Compose/deploy/automatic+manual rollback contracts passed. Initial sandbox-only unit listen EPERM was resolved by rerunning with permission for temporary loopback listeners.
- Production application rollout, final main SHA, GitHub run and post-deployment verification are pending at this entry; a working hostname alone does not mean latest code is deployed.

- TypeScript / Svelte: `npm run check` passed, 0 errors and 0 warnings.
- Full unit suite: 50 files passed, 1 skipped; 535 tests passed, 11 skipped.
- Catalogs: 861 English and Chinese leaf keys; Chinese has zero missing or empty keys and no untranslated English-only values. ICU argument names match for every entry.
- Production bundle: `npm run build` passed.
- Browser verified at localhost:5173: translated homepage title, introduction, footer, navigation, login, register, map toolbar, map styles and overlays. Brand names, technical units, user data and third-party attribution are intentionally retained.
- Administrator About Markdown overrides are covered by regression tests; selected map style IDs are preserved by an SSR regression test.
- No API/DB schema changes, commits, pushes or production deployment were performed.

## Existing limitation

The PDF exporter uses a Latin-only font for user-authored route names and descriptions. This pre-existing limitation is unchanged; the newly localized scale caption uses a system-font canvas image so this change does not add missing Chinese glyphs to that caption.
# Header language follow-up

## Compact layout follow-up (R8)

- Audited shared controls and public/settings/trail/list route composition. Source baseline: normal text fields around50px, large buttons48px, large search62px, mobile settings11 stacked navigation rows, home full-height hero/96px gaps and footer48px padding.
- Compact controls now regular36px/large40px desktop and44px mobile; Search48/52px uses structural centering, generated labels/IDs and preserved clear/dropdown behavior. Long labels grow instead of clipping. Native map buttons unchanged.
- Header80px desktop/72px mobile uses one CSS variable; maps/list/edit viewport offsets synchronized. Mobile map two-row toolbar fits the viewport. Reduced home/auth/forms/card/detail/editor spacing and cover sizes without deleting fields. Mobile footer retains all links in three compact columns.
- Actual-app tests visited17 unique public/settings/editor pages in desktop1280px and mobile375px views. Settings content begins at80px desktop /156px mobile; all9 settings sections and the mobile selector were exercised with no settings writes. Test-owned random accounts were deleted successfully after each run; no human accounts or production changes.
- Regression fixes caught by verification: generated TextField/Select/FileInput IDs must be per-instance, not repeated names; native open dialogs must not remain aria-hidden; scroll-unlock assertions wait for queued close events. Existing editor test locator updated to its translated link key.
- FINAL: type check0errors/0warnings;572 unit tests passed (11 existing skips), all51 focused browser tests passed, production build exit0 and git diff --check clean. Desktop/mobile settings, home/auth and map screenshots visually reviewed. Changes remain local/uncommitted.


## Compact typography follow-up

- Three source files changed: shared runtime type tokens/body/mobile control rules in app.css, plain prose in components.css, and large search min-height62px. Root font size, spacing, colors, font family and small metadata are untouched.
- Actual computed sizes verified: desktop body15/hero56/section40/search18, mobile body16/hero40/section32 and editable controls at least16. Header selector44px and login48px heights preserved; search icon alignment and no horizontal overflow checked.
- Browser font enlargement remains proportional (20px root → body18.75/hero70); dark-mode foreground and language switching verified.
- Final verification: type check0errors/0warnings; unit tests572passed/11existing skips; all6 typography+language browser tests passed; production build exit0; git diff --check clean. Desktop/mobile screenshots reviewed.
- Existing language browser regression now waits for the login TextField client action before interaction; an SSR title alone is not a hydration signal.

## Header validation

- Added an always-visible native language selector; Chinese/English first, preserving all 14 existing locales.
- Browser-cookie preference shared by client/server; explicit account language saves synchronize it. No account writes from the header.
- Added helper/hook/SSR-component regression coverage and actual-app Playwright checks for immediate switching, refresh/navigation, rendered SSR text, mobile375px and delayed language chunks.
- Review caught asynchronous language-load races; switch is serialized, persisted only after success, and restored with a translated notice on failure.
- Final checks: type checker reports 0 errors/0 warnings; unit suite 572 passed / 11 existing skips; all 3 actual-app browser tests passed. Desktop1280px and mobile375px screenshots visually reviewed; the top selector is visible and mobile has no horizontal overflow. Authenticated preference behavior is covered by hook tests, not a signed-in browser session.
