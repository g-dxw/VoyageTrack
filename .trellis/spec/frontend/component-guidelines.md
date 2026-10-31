# Component Guidelines

Components are Svelte 5 files. Prefer small, composable components with explicit typed props and event/callback contracts. Reuse primitives in `web/src/lib/components/base/` (button, modal, select, search, tabs, toast, and similar) before creating a duplicate control.

Keep page data loading in route `load` functions and pass the resulting data into components. Components may use stores or browser APIs when they own the interaction, but keep PocketBase and server-only imports behind the client boundary in `web/src/lib/pocketbase.ts`.

Use Tailwind utility classes for local layout and shared rules/tokens in `web/src/css/theme.css`, `components.css`, and `app.css`. Preserve responsive and dark-mode classes. Labels, keyboard access, focus states, and semantic buttons/links are required for interactive controls.

Reference examples: `web/src/lib/components/base/modal.svelte`, `web/src/lib/components/base/search.svelte`, `web/src/lib/components/map/style_switcher.svelte`, and `web/src/routes/trail/view/[handle]/[id]/+page.svelte`.

## Compact typography

Use the shared Tailwind `--text-*` scale in `css/app.css`, not per-page pixel overrides or `html { font-size: ... }`/zoom. At a default16px root the desktop scale is base15, lg17, xl18, 2xl22, 3xl28, 4xl32, 5xl40, 6xl48 and 7xl56px; sm14 and xs12 remain unchanged. Tokens live in an unlayered `:root` rule because `components.css` also imports the default Tailwind theme. Root rem geometry must remain unchanged so compact text does not shrink control heights or spacing.

Below40rem the base returns to1rem and text/editable controls have a1rem floor; never reduce mobile input text below the browser's readable default. Body/plain `.prose` use the same token with1.6 line height, while explicit prose size variants keep their own styling. Verify computed sizes, browser font enlargement, mobile overflow/control dimensions and theme/language switching using `tests/playwright/components/typography.spec.ts` and `header-language.spec.ts`.

## Compact layout

Shared controls use content-driven minimum heights: desktop regular36px/large40px and mobile44px. Button and custom-select labels must wrap and increase the control height rather than being clipped. Large Search uses48px desktop/52px mobile; its visible label is outside the relative input-row wrapper so the search icon and clear button stay vertically centered on the input, independent of label wrapping. Do not restore the obsolete bottom31px absolute offsets or62px minimum height.

Use `--app-header-height` for viewport-dependent map/list/editor heights (desktop80px/mobile72px). Settings keeps desktop navigation links and uses a labeled native selector on mobile; navigating sections must not trigger autosave. Verify public/authenticated page reflow and navigation in `layout-density.spec.ts`, and multiline labels, labeled search alignment/clear behavior and empty modal footers in `compact-controls.spec.ts`.

Form `name` values are submission keys, not unique DOM identifiers. `TextField` preserves an explicit `id` or generates an instance ID using a standalone top-level `$props.id()` initializer; Select/FileInput also generate per-instance IDs and bind labels to them. Never assign repeated/empty names to `id`. Keep the multi-card `trail-modals.spec.ts` unique-ID regression green. Native closed `<dialog>` elements are already hidden; do not leave `aria-hidden="true"` on an open dialog. Close events are queued, so scroll-unlock assertions must poll for the event's completed state.
