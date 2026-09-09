# Frontend Directory Structure

```text
web/src/
├── routes/        # SvelteKit pages, layouts, API endpoints
├── lib/components/ # reusable UI, feature components, base controls
├── lib/models/    # domain classes/types and pure model tests
├── lib/stores/    # cross-route reactive stores
├── lib/server/    # server-only upstream adapters
├── lib/config/    # map and runtime configuration
├── lib/i18n/      # locale setup and translation resources
├── lib/util/      # shared pure/browser utilities
├── lib/vendor/    # checked-in third-party adapters/components
└── css/           # global theme and component styles
```

Use route-local files for page orchestration and `+server.ts` for SvelteKit endpoints. Keep reusable domain behavior out of pages; `web/src/lib/models/trail.ts` and `web/src/lib/models/trail.test.ts` are the model pattern. Keep server-only network code under `lib/server/` and never import it into browser components.

Names follow SvelteKit conventions: `+page.svelte`, `+page.ts`, `+page.server.ts`, `+server.ts`; component files are lower-case `.svelte`, while model classes/types use descriptive lower-case filenames.
