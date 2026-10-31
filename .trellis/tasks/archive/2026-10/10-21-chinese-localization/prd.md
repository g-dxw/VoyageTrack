# Complete Chinese interface translations

## Goal

Make the existing web application's Chinese locale consistently Chinese, including built-in explanatory content, controls, tooltips, accessibility labels, page titles, validation messages, and map tools.

## Background

- The user explicitly requests implementation of all remaining English translations in the local development preview.
- English and Chinese catalogs currently contain 694 keys each; seven Chinese values are untranslated or empty.
- The current homepage displays Chinese navigation alongside English built-in About content, page title, footer groups, and accessibility labels.

## Requirements

- R1: Translate untranslated Chinese catalog values while preserving ICU arguments and plural behavior.
- R2: Route remaining application-owned visible and accessible English strings through the existing svelte-i18n resources.
- R3: Localize built-in homepage About content without replacing administrator-provided custom content.
- R4: Preserve language selection and existing functionality, user data, technical identifiers, units, brand names, and third-party map attribution.
- R5: Verify in the running local preview; do not push, merge, or deploy these changes.
- R6: Provide a language selector in the top navigation, visible on desktop and mobile, that switches immediately and remembers this browser's choice across navigation and refresh for anonymous and signed-in visitors.
- R7: Make the existing interface typography modestly more compact, particularly oversized home headings, shared titles/search and desktop body copy; preserve mobile reading and input legibility, existing small metadata, layout geometry and interactive target sizes.
- R8: Improve information density across content, form and settings pages: compact oversized buttons/inputs, remove excessive blank space and the mobile settings menu wall, reduce scrolling while preserving all information and functionality.
- R9 (2026-10-24): The user now explicitly authorizes publishing the latest local work to `https://track.cqaiclub.online` on `cqaiclubOnline` (`49.234.192.148`). This supersedes R5 and the previous local-only deployment exclusions. Preserve protected `dev` → `main`, build exclusively in GitHub Actions, preserve production data and unrelated services, and verify DNS, TLS, release SHA and public application behavior.

## Acceptance criteria

- Chinese messages cover every English catalog key, contain no empty translations, and preserve interpolation contracts.
- Home, navigation, login/register, settings, route/map controls and shared dialogs show translated application-owned copy when Chinese is selected.
- Generated locale keys used by controls are represented in English and Chinese catalogs.
- Type checking, focused localization regression tests, existing unit tests and production build pass.
- Browser verification demonstrates the corrected Chinese homepage and representative public flows.
- The header language choice takes precedence over account/browser defaults without automatically changing account settings. Existing account language saves synchronize the browser choice.
- Desktop hero/section headings and body text are smaller; mobile body and inputs remain at least 16px. Root rem geometry, language switching and responsive layout remain intact; R8 intentionally revises control heights without further reducing text.
- Regular desktop controls are approximately36px, large controls40px; mobile controls retain44px targets and16px editable text. Multiline labels grow naturally. Settings content is reachable without scrolling past11 navigation rows. Home/auth/settings/trail/list pages have reduced padding and section gaps without hiding content.

## Out of scope

User-authored content, external documentation, PocketBase's separately supplied administration UI, automatically changing account language preferences from the header, changing routes/API payloads, production deployment, and translation of proper names or technical file formats.
