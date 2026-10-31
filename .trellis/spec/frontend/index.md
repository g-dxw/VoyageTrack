# Frontend Development Guidelines

The frontend is a SvelteKit 2 application in `web/`, using Svelte 5, TypeScript, Tailwind CSS, PocketBase, Meilisearch, MapLibre, and Vitest/Playwright.

## Guides

| Guide | Use when |
|---|---|
| [Directory Structure](./directory-structure.md) | Adding routes, components, models, or stores |
| [Component Guidelines](./component-guidelines.md) | Building or extending `.svelte` components |
| [Homepage Scene](./homepage-scene.md) | Changing the public homepage model, animation, loading or cleanup |
| [Homepage Featured Trails](./homepage-featured.md) | Changing public homepage data, curated content or case cards |
| [User Center](./user-center.md) | Separating the public homepage from authenticated own-trail management |
| [Hook Guidelines](./hook-guidelines.md) | Working on SvelteKit hooks or lifecycle logic |
| [OAuth Callback](./oauth-callback.md) | Changing native-OIDC Web login, callback or response privacy |
| [State Management](./state-management.md) | Choosing between load data, stores, and URL state |
| [Type Safety](./type-safety.md) | Adding models, API data, or validation |
| [Quality Guidelines](./quality-guidelines.md) | Testing or reviewing web changes |

## Pre-Development Checklist

- Locate the route under `web/src/routes/` and reuse existing `+page.ts`, `+page.server.ts`, or `+server.ts` data flow.
- Check whether shared behavior belongs in `web/src/lib/components`, `models`, `stores`, `server`, or `util`.
- Preserve auth/CSRF behavior in `web/src/hooks.server.ts` and client-only boundaries in `web/src/lib/pocketbase.ts`.
- Follow the backend [Rich-Text Sanitization Contract](../backend/rich-text-sanitization.md) for every `{@html}` or `innerHTML` sink.
- Reuse i18n keys and existing base components before adding UI primitives.
- Add a Vitest test for pure model/util behavior and Playwright coverage for critical user flows.

## Quality Check

```powershell
cd web
npm.cmd run check
npm.cmd run test:unit
npm.cmd run build
```

Run `npm.cmd run test:integration` when routes, auth, lists, or browser behavior changes.
