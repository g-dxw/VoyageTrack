# Validation

## Authorized production release preflight (2026-10-24)

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
