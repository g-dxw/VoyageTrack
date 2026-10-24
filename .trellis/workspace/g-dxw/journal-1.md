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
