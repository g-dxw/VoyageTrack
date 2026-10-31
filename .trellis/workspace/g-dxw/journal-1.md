# Journal - g-dxw (Part 1)

> AI development session journal
> Started: 2026-08-30

---



## Session 1: Merge upstream Wanderer dev
<!-- trellis-session: v=2 fp=dfaff6bef41a2e64 -->

**Date**: 2026-10-20
**Task**: Merge upstream Wanderer dev
**Branch**: `dev_0.0.1`

### Summary

Merged open-wanderer/wanderer dev at 298d3369 while preserving VoyageTrack imports, Tianditu maps, 3D terrain, Chinese locale, and local deployment settings. Added collection-aware rich-text sanitization, required shared ActivityPub proxy secret wiring, regression coverage, and executable security specs. Full Go, web, plugin, TinyGo, docs, and build gates passed; browser smoke and live migration rehearsal remain deployment-time checks.

### Git Commits

| Hash | Message |
|------|---------|
| `1057d417` | chore: merge upstream dev at 298d3369 |
| `132be7b8` | docs: record security contracts from upstream merge |

### Status

[OK] **Completed**


## Session 2: Protected VoyageTrack production delivery
<!-- trellis-session: v=2 fp=9b1884d6593b661c -->

**Date**: 2026-10-20
**Task**: Protected VoyageTrack production delivery
**Branch**: `dev`

### Summary

Merged upstream delivery work, enforced dev-only main PRs, added GitHub-built immutable production images with guarded deployment and rollback, deployed main 3935b6c9 to cqaiclubOnline, and verified all three services healthy; public hostname remains blocked by an unavailable Cloudflare Tunnel.

### Git Commits

| Hash | Message |
|------|---------|
| `a630b264` | ci: add protected production deployment pipeline |
| `89c352a4` | fix(ci): track deployment test runner |
| `3ad2524e` | fix(deploy): mirror search image through GHCR |
| `7a25fbb9` | fix(deploy): stream prebuilt images to production |
| `8cb89198` | fix(deploy): pull artifacts through mainland mirrors |
| `4fe1bdf1` | fix(deploy): keep image pulls connected |

### Status

[OK] **Completed**


## Session 3: Deploy Chinese compact UI to track.cqaiclub.online
<!-- trellis-session: v=2 fp=e661a792224d1341 -->

**Date**: 2026-10-24
**Task**: Deploy Chinese compact UI to track.cqaiclub.online
**Branch**: `dev`

### Summary

Published protected dev-to-main PR31 at 2302b1b6 via successful Actions run40085764879; immutable web/db revisions, health, backup, new ORIGIN, HTTPS and renewal verified. Full CI110 browser and572 unit tests passed. Public read-only language/persistence/mobile diagnostics passed after hydration readiness; original public run6/8 with2 cold-load timeouts, cold hydration5-15s recorded honestly. No production account writes; local temporary test infrastructure cleaned.

### Git Commits

| Hash | Message |
|------|---------|
| `77199dbf` | feat(web): localize and compact UI for track.cqaiclub.online |
| `76c6bd12` | test(web): align full-suite selectors with localized UI |
| `2302b1b6` | Merge pull request #31 from g-dxw/dev |

### Status

[OK] **Completed**


## Session 4: Dependabot PR queue maintenance
<!-- trellis-session: v=2 fp=25ee98b89c4c90c3 -->

**Date**: 2026-10-31
**Task**: Dependabot PR queue maintenance
**Branch**: `dev`

### Summary

Merged PR #42 to activate bounded Dependabot version updates on dev; reduced open dependency PRs from 11 to 3 and cancelled the configuration-only production workflow.

### Main Changes

- All eight update tasks now target dev, cap open version PRs at one per task, and allow minor/patch only; monthly schedules, groups and seven-day cooldowns are preserved. GitHub security update behavior is unchanged.
- Closed deferred major PRs #1, #5, #6, #9, #11, #12, #22 and #23; retargeted and synchronized #24, #25 and #26 to dev without merging dependencies.

### Git Commits

| Hash | Message |
|------|---------|
| `d5179301b09576d68cb89990687ec35364a52bcc` | chore(deps): route bounded maintenance updates through dev |

### Testing

- [OK] YAML semantic validation, independent policy review, GitHub Dependabot configuration check, all eight check-runs, 110 Playwright tests and 572 unit tests passed; 11 existing unit tests skipped.
- [OK] Production workflow 41168193257 was cancelled before image-build/deploy steps; original 27 dirty paths and working-tree diff remained unchanged.

### Status

[OK] **Completed**

### Next Steps

- Review the three retained dependency PRs on dev separately; the Go update also changes its runtime requirement and PocketBase version.


## Session 5: Resolve remaining dependency PRs
<!-- trellis-session: v=2 fp=dbc918e15b3c7d49 -->

**Date**: 2026-10-31
**Task**: Resolve remaining dependency PRs
**Branch**: `dev`

### Summary

Merged docs #44, frontend #45 and compatible backend replacement #48 into dev; closed superseded backend bundles #43/#47; open PR queue verified empty. Production application was not deployed.

### Main Changes

- PocketBase minor version upgrades require a coordinated Go/runtime review; policy #46 reached main and its automatic production workflow was cancelled before build or deploy steps.
- Backend updates four direct modules plus GPX-required x/* modules; preserves Go directive1.25.0, PocketBase0.38.0, SQLite1.50.0 and ozzo-validation4.3.0. Adapted one production and three existing test GetStats calls to nil options after SDK source comparison.
- Validation4.4.1 caused PocketBase initial _otps migration failures; reverting that dependency alone removed the failures. Original27 dirty paths and working-tree diff remained unchanged after local fast-forward.

### Git Commits

| Hash | Message |
|------|---------|
| `60abb4d1c81842f3ee5c5cee4e84344fe89c93ff` | chore(deps): defer PocketBase minor upgrades for runtime review |
| `3a90e26d3a50b255dd695330d7c85df6f683fe84` | Merge pull request #44 from g-dxw/dependabot/npm_and_yarn/docs/dev/docker-backward-compatible-dc4ef8d556 |
| `ddeb7362e70b82a2c8483b63313ed574c314d011` | Merge pull request #45 from g-dxw/dependabot/npm_and_yarn/web/dev/npm-backward-compatible-be3ae924b8 |
| `5ff842c8b79ff23b4218d666d1b6a1950f0ad5bc` | fix(deps): keep backend updates compatible with current runtime |

### Testing

- [OK] Docs PR44 npm ci and full build passed on checksum-verified Node22.23.4; lockfile unchanged, Astro check0 errors/warnings/hints,178HTML pages generated.
- [OK] Backend Go1.26.1 GOTOOLCHAIN=local CGO_ENABLED=0 format/vet/test/build passed; dedicated real-Meilisearch tests skipped without their binary. Independent diff/API review passed.
- [OK] Combined PR48 cloud CI passed Go/plugins/contracts, Svelte check0 errors/warnings,110Playwright and572unit tests;11existing unit skips. PR45 full CI also passed.

### Status

[OK] **Completed**

### Next Steps

- Production release remains separate. Evaluate Go1.27/PocketBase0.40 and validation4.4 compatibility in a dedicated framework upgrade.
