# Component Guidelines

Components are Svelte 5 files. Prefer small, composable components with explicit typed props and event/callback contracts. Reuse primitives in `web/src/lib/components/base/` (button, modal, select, search, tabs, toast, and similar) before creating a duplicate control.

Keep page data loading in route `load` functions and pass the resulting data into components. Components may use stores or browser APIs when they own the interaction, but keep PocketBase and server-only imports behind the client boundary in `web/src/lib/pocketbase.ts`.

Use Tailwind utility classes for local layout and shared rules/tokens in `web/src/css/theme.css`, `components.css`, and `app.css`. Preserve responsive and dark-mode classes. Labels, keyboard access, focus states, and semantic buttons/links are required for interactive controls.

Reference examples: `web/src/lib/components/base/modal.svelte`, `web/src/lib/components/base/search.svelte`, `web/src/lib/components/map/style_switcher.svelte`, and `web/src/routes/trail/view/[handle]/[id]/+page.svelte`.
