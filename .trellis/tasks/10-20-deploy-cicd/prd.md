# Deploy VoyageTrack with protected CI/CD

## Goal

Publish the current VoyageTrack code through a controlled `dev` → `main`
promotion path and deploy it to `cqaiclubOnline`. GitHub Actions must perform
all application compilation and image packaging; the production server may only
pull immutable artifacts, back up persistent data, restart services, and verify
health.

## Background and Confirmed Facts

- Repository: public `g-dxw/VoyageTrack`; default branch is `main`.
- Remote `main` is at `628f6ae8`. A remote `dev` branch does not currently
  exist. Remote `dev_0.0.1` is at `4a4d8f49`; the completed upstream merge is
  local at `c726d851` and contains `main` as an ancestor.
- `main` currently has no branch protection and the repository has no Actions
  secrets or variables.
- Existing release workflows require `release/v*` and publish upstream-owned
  image names. That conflicts with the requested `dev`-only promotion model.
- `cqaiclubOnline` is Ubuntu 22.04 x86_64 with Docker 29 and Compose 2.40.
  It has about 22 GiB free disk and 2.1 GiB available memory, with no swap.
- Existing services use loopback ports `3001`, `8089`, and `18080` and must not
  be interrupted. Ports `13000` (web) and `18090` (PocketBase diagnostics) are
  available for VoyageTrack.
- The intended application origin in the repository is
  `https://gdxw.dpdns.org`, but it currently returns Cloudflare HTTP 530.
- The root Compose file uses published upstream images, so it cannot deploy the
  local VoyageTrack customizations without new project-owned images.

## Requirements

### Branch governance

- Create and use `dev` as the sole development/integration branch.
- `main` may only change through a pull request whose head branch is exactly
  `dev`. Other branches may open a PR, but a required status check must prevent
  them from being merged.
- Protect `main` with required PRs, strict required checks, administrator
  enforcement, conversation resolution, and disabled force-push/deletion.
- Direct pushes to `main`, including administrator pushes, must be rejected.
- Pushes to `dev` run validation but never deploy production.

### CI and artifact build

- Run Go formatting/vet/tests, first-party plugin tests/builds, Svelte checks,
  unit/integration tests, and production builds in GitHub Actions.
- On a merged `dev` → `main` PR, build the DB and Web OCI images in GitHub
  Actions for the production server's `linux/amd64` platform.
- Publish images to project-owned GHCR names with an immutable commit-SHA tag;
  a mutable convenience tag may exist but production must deploy the SHA tag.
- The production server must not clone the repository, run Go/Node/TinyGo, or
  build Docker images.
- Remove or replace obsolete workflows that publish upstream Docker Hub/GHCR
  names or require `release/v*` branches.

### Production deployment

- Deploy under `/srv/apps/voyagetrack` as an isolated Compose project.
- Persist PocketBase data, uploads, plugins, and Meilisearch data across image
  updates. Do not reuse or overwrite another application's data.
- Keep production secrets only in a root-readable server `.env`; generate new
  Meilisearch, PocketBase encryption, and proxy secrets and never commit them.
- Use a dedicated restricted SSH deploy key. Store only its private half in
  GitHub Actions secrets; install a forced-command public key on the server.
- Before each update, record the current image tag and create a timestamped
  PocketBase backup. Deploy under a lock, wait for service health, and roll back
  images and data when the new stack fails verification.
- Proxy the app through Nginx without exposing PocketBase or Meilisearch to the
  public network. Preserve all existing Nginx sites and containers.
- Restore `https://gdxw.dpdns.org` as the public origin if the available DNS
  account permits it. Do not claim public deployment success while it returns
  Cloudflare 530; if DNS control is unavailable, report that as the remaining
  external gate after proving the host-local deployment.

### Release verification

- The initial release must follow the new path: push `dev`, open a PR into
  `main`, pass required checks, merge, build images, deploy, and verify.
- Verify GitHub run conclusions, immutable deployed image tags/digests,
  container health, host-local HTTP, public HTTPS, persistence mounts, backup
  creation, and continued health of the existing Xianyu and group-buy services.
- Keep a recovery branch/commit and a documented server rollback command.

## Acceptance Criteria

- [ ] Remote `dev` points to the approved current code and is the only accepted
      PR head for `main`.
- [ ] A test PR from a non-`dev` branch receives a failing source-policy check,
      while a `dev` → `main` PR passes that policy.
- [ ] GitHub reports `main` as protected with PR-only updates, strict required
      checks, admin enforcement, conversation resolution, and no force/delete.
- [ ] Go, web, plugin, and image build jobs run in Actions; production deploys
      GHCR images tagged with the merged 40-character SHA.
- [ ] No compiler, source checkout, or `docker build` command is used on
      `cqaiclubOnline`.
- [ ] `/srv/apps/voyagetrack` contains only deployment configuration, persistent
      data, backups, and release metadata; secret values are not tracked.
- [ ] VoyageTrack containers are healthy on the target host and only the web
      endpoint is reachable through Nginx.
- [ ] An intentionally invalid deploy tag is rejected or rolled back without
      damaging persistent data.
- [ ] `https://gdxw.dpdns.org` returns the application over HTTPS, or DNS access
      is explicitly identified as the sole remaining external blocker with
      host-local deployment proof.
- [ ] Existing `xianyu-online-*` containers and the group-buy endpoint remain
      healthy after deployment.
- [ ] The repository, server, and public endpoint all identify the same release
      SHA; no workflow, deployment, or verification run remains pending.

## Out of Scope

- Changing VoyageTrack product features or database schemas beyond the already
  merged upstream update.
- Publishing official upstream Wanderer releases or Docker Hub images.
- Automatic installation/enabling of third-party provider credentials. Bundled
  plugins are compiled and validated in CI but remain operator-installed.
- Replacing the existing Xianyu reverse tunnel or group-buy deployment.
- Mobile App Store / TestFlight publication.

## Risks and Deferred External Inputs

- The Cloudflare 530 response indicates an external DNS/origin configuration
  problem. Existing local/server credentials do not currently expose a DNS API;
  public HTTPS may require the user to provide access to the domain account.
- The host has no swap and already runs five containers. Production Compose
  must use conservative memory limits and must validate existing services after
  startup.
- PocketBase migrations can be irreversible. A consistent pre-start backup is
  mandatory before the first image using the merged upstream migrations.
