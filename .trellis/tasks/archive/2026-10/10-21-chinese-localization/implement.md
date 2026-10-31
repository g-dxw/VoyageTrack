# Implementation

1. Audit both catalogs and application-owned visible text, attributes, validation, and map control strings.
2. Translate remaining Chinese values and hardcoded UI copy using shared i18n keys.
3. Preserve administrator custom About content while translating bundled content.
4. Add meaningful catalog parity/interpolation and localized rendering regression checks.
5. Run `npm run check`, `npm run test:unit -- --run`, and `npm run build` from web.
6. Review remaining English matches for proper names and dynamic data.
7. Verify Chinese home, login/register and map controls in the local preview; leave the preview running and report the local result.

## Header language follow-up

1. Add shared cookie parsing/serialization and locale priority functions with invalid-value and precedence tests.
2. Use that priority in client initialization and the existing server hook; synchronize successful account language changes.
3. Add a keyboard-accessible, responsive header selector and update the active menu indicator after translation changes.
4. Check types, unit tests and production build; verify live switching, refresh persistence and mobile layout in the local preview. Do not commit, push or deploy.

## Compact typography follow-up

1. Override the shared text scale without changing the rem root; align body/prose and protect mobile editable text.
2. Preserve large search field geometry and existing header/control target sizes.
3. Add actual-app computed-style checks for desktop/mobile font sizes, preserved metadata and search alignment; rerun language switching checks.
4. Verify types, unit suite/build, and desktop/mobile screenshots; keep the local preview running and do not publish.

## Compact layout follow-up

1. Record baseline public/authenticated page metrics using an isolated local-only random test account with guarded cleanup.
2. Implement shared controls, settings navigation/spacing and trail/list density in disjoint worker ownership. Main integrates header offsets, home/auth/public route spacing.
3. Update intentional typography/control-size assertions. Verify desktop/mobile control heights, wrapping, search icon alignment, settings navigation, unchanged data and reduced page/form heights.
4. Run type check, unit suite, build and focused actual-app/component browser tests, visually review screenshots, record limitations, and leave local preview running without committing or deploying.

## Authorized production release (2026-10-24)

1. Recheck remote branches/protection, Actions secrets, production SHA, DNS, existing Nginx/certificates and available disk. Do not expose runtime secrets.
2. Add the new hostname templates and contract coverage. Make new browser regressions compatible with both Vite and the built application. Re-run checks/unit/build and applicable browser tests.
3. Commit reviewed changes on dev, merge origin/main into dev if required for strict protection, push dev, create/attach dev → main PR, and wait for required checks before merging.
4. Configure the isolated hostname HTTP challenge site, obtain TLS certificate, install validated TLS site and renewal reload, and back up/update only ORIGIN in production's root-only .env. Never compile on the server.
5. Wait for exact main-SHA Actions build/deployment. Verify images/release labels, container health, database health, HTTPS certificate, Chinese copy/language switch and desktop/mobile layout. Record actual evidence and report any external access gate.
