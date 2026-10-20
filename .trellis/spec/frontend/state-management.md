# State Management

Use the narrowest state owner:

- Route/server data: SvelteKit `load` return values and `event.locals` (`web/src/routes/+layout.server.ts`).
- Component interaction state: local Svelte variables for modal, selection, and form state.
- Cross-route client state: existing stores under `web/src/lib/stores/`.
- Shareable filters and pagination: URL query parameters handled by route loads.
- Server records: PocketBase/Meilisearch responses, refreshed through existing model/store helpers rather than a second cache.

Keep derived values close to their source and avoid promoting one-page state into a global store. When auth changes, preserve the server hook's cookie and token invalidation behavior. Store modules should expose typed functions and stores, not raw mutable singleton data.
