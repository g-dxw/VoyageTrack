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
