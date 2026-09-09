# Documentation Guidelines

`docs/` is an Astro 7 + Starlight site. Pages and user/developer guides live under `docs/src/pages/` and `docs/src/content/docs/`; shared theme/configuration is in `docs/src/custom.css`, `docs/src/tailwind.css`, `docs/astro.config.mjs`, and `docs/src/content.config.ts`.

## Pre-Development Checklist

- Identify whether the page is a Starlight content page, Astro page, or shared layout/configuration change.
- Verify commands and environment names against `README.md`, `CONTRIBUTING.md`, and Docker files.
- For API documentation, check the generated OpenAPI source and `docs` sync script.
- Keep public examples free of credentials and private host data.

Use MDX frontmatter (`title`, `description`) and Starlight components for documentation pages. Keep installation, development, and API claims aligned with `README.md`, `CONTRIBUTING.md`, Docker files, and the actual `web`/`db` scripts. OpenAPI content is synchronized by the docs build (`npm run sync-openapi`).

## Quality Check

```powershell
cd docs
npm.cmd ci
npm.cmd run build
```

Do not put secrets, private deployment URLs, or unverified provider behavior in public docs.
