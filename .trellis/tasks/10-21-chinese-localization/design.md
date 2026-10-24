# Design

Use the existing svelte-i18n catalogs and locale store. Add missing translation keys with matching English/Chinese entries. Preserve static identifiers, URLs and dynamic user data. Localize application-owned UI at the component or utility that owns its rendering; do not replace arbitrary English strings globally.

The homepage fetches `/md/about.md`, which may be replaced by administrators. Supply localized built-in content with a mechanism that preserves that override contract. Keep markdown sanitization in place.

Partition implementation ownership: one worker owns map/trail components and corresponding namespaced translation additions; another owns shared components/settings/profile UI. The main agent owns the catalogs, route pages, built-in content, locale parity/interpolation checks, integration, and browser verification. Workers report requested locale entries rather than concurrently editing catalogs.

All changes remain local. Verification runs against the already running Vite server with dedicated local PocketBase and Meilisearch services.

## Header language follow-up

The missing behavior is a public, always-visible language control, not a new translation engine. Add a compact native select to the existing navigation, using the locale store and existing language labels. Preserve all supported locales, with Chinese and English first. Reuse theme tokens, focus feedback, and keyboard semantics; keep it reachable outside the mobile drawer.

Share locale preference resolution between client initialization and the server hook: valid `wanderer_locale` cookie > account language > browser language > existing default. The cookie is browser-local, path `/`, one year, SameSite=Lax and Secure on HTTPS. Ignore malformed/unsupported values. The switch writes only this preference and updates the locale store; no account API call or page reload. Existing explicit account language saves synchronize the cookie after success.

Expected source boundary: a small language selector component and navigation integration; a pure locale preference helper/tests; client initialization, server locale resolution and the existing account language save action. No auth/session redesign, new dependencies, backend schema change, deployment, or unrelated localization edits. Remeasure the existing active navigation indicator after locale changes so its styling remains aligned.

## Compact typography follow-up

The oversized type is owned by the Tailwind text-size theme, not browser zoom. Define a compact rem-based scale in `web/src/css/app.css`: base16→15, lg18→17, xl20→18, 2xl24→22, 3xl30→28, 4xl36→32, 5xl48→40, 6xl60→48, 7xl72→56 (px at the browser default16px root). Preserve xs12/sm14 and keep the root font-size untouched so spacing, map geometry and control heights do not shrink.

Set body and existing Markdown `.prose` copy to the base token with comfortable line height. At widths below40rem, keep body at1rem and enforce a1rem minimum on editable/native text controls, preserving browser text scaling. The existing large search field uses bottom31px-centered controls; retain its pre-change62px minimum height rather than moving interactions or shrinking the hit area.

Source boundary: typography theme/base rules in `app.css`, shared `.prose` rule in `components.css`, and a minimum-height class in `base/search.svelte`. Add computed-style browser tests for representative pages and shared controls, plus desktop/mobile screenshots. No new fonts, root zoom hacks, route/business logic, PocketBase dashboard changes, print/PDF redesign, commits or deployments.

## Compact layout follow-up

The remaining density gap lives in shared control padding and route composition, not font size. Use content-driven desktop button/input min-heights36px (large40px),44px on mobile, with wrapping/focus/loading/error states preserved. Large search becomes48px desktop/52px mobile; put icons inside an input-row wrapper and center structurally rather than keeping bottom25/31px offsets. Reduce modal padding and omit the empty footer. Do not alter native map controls or root rem/typography.

Settings: replace the mobile11-row navigation wall with a labeled native selector, retain keyboard-accessible desktop links; compact sidebar and section gaps. Preserve existing autosave and account behavior. Content pages: reduce homepage full-screen hero/96px gaps, auth panel padding, trail/list card/filter/detail padding and edit-side form spacing. No fields/content removed, no new collapse state, no map/editor business logic changes.

Ownership: shared-control worker owns components.css and base control templates; settings worker owns settings layout/pages; content worker owns trail/list components and edit pages. Main agent owns app.css header-height variable, navigation/language control, home/auth/map/public route framing/footer, tests and integration. Synchronize any header-height-dependent offsets with one CSS variable instead of unrelated magic numbers. Mobile footer uses three compact resource columns without dropping links or reducing existing metadata text.

Verify public and signed-in representative pages with an isolated random local test account; create/delete only that known test account, never run existing destructive Test teardown or edit user settings. Capture before/after page and form heights, desktop/mobile screenshots, computed control sizes, reflow and behavior checks. No real credentials in test sources/artifacts; no production changes or deployment.

## Authorized production release (2026-10-24)

Release the existing localization/layout work through the established protected pipeline. Add only the new hostname's HTTP bootstrap/TLS Nginx templates, template validation and operating instructions; keep the legacy hostname configuration intact. Production runtime ORIGIN must change atomically for both web and database to `https://track.cqaiclub.online`, without replacing secrets or copying local database state. Back up the runtime environment and Nginx state before changes. Issue a separate hostname certificate using the existing Certbot installation, validate Nginx before reload, and retain the existing rollback/data-backup deployment mechanism. Do not change branch-protection rules or bypass checks. Fix only test-harness assumptions that incorrectly rely on Vite source URLs when CI runs the production build.
