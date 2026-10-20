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
