# Production Delivery Contract

## 1. Scope and trigger

Use this guide for changes to `.github/workflows/`, `deploy/`, production image metadata, server runtime configuration, Nginx routing, or rollback behavior. Production delivery is a cross-layer contract: GitHub Actions builds immutable artifacts, while `cqaiclubOnline` only pulls and runs them.

## 2. Signatures

- Release identity: a full lowercase 40-character Git SHA.
- Image tag: `sha-<release-sha>` for both `ghcr.io/g-dxw/voyagetrack-db` and `ghcr.io/g-dxw/voyagetrack-web`.
- Image provenance label: `org.opencontainers.image.revision=<release-sha>`.
- Automated SSH command: `deploy <release-sha>` through `/usr/local/sbin/voyagetrack-deploy-key`.
- Root deploy entrypoint: `/usr/local/sbin/voyagetrack-deploy [--restore] <release-sha>`.
- Manual rollback entrypoint: `/usr/local/sbin/voyagetrack-rollback <previous-release-sha>`.
- Runtime state: `/srv/apps/voyagetrack/{compose.yml,.env,.release,data,backups}`.
- Required secret configuration: `ORIGIN`, `MEILI_MASTER_KEY`, `POCKETBASE_ENCRYPTION_KEY`, and `POCKETBASE_PROXY_SECRET`.

## 3. Contracts

- `main` is production-only. Pull requests into `main` must originate from the repository's own `dev` branch. Required checks are `check-source`, `db-test`, `deployment-contracts`, and `test`; branch protection must require a pull request, strict checks, resolved conversations, administrator enforcement, and forbid force pushes and deletion.
- A push to `main` may deploy only that exact SHA. Manual workflow dispatch must resolve `refs/heads/main`, never an arbitrary ref.
- The deploy workflow must wait for successful `go.yml` and `web.yaml` push runs for the same `main` SHA before building release images.
- Go, Node, TinyGo, OpenAPI generation, Docker builds, and image publication run in GitHub Actions. Production must not clone source, compile code, or run `docker build`.
- Production images are `linux/amd64`, immutable by SHA tag, and must carry a revision label equal to the requested release. The server must reject a tag whose label does not match.
- GHCR images must be anonymously readable. CI must test anonymous manifest access before SSH because the server intentionally has no long-lived registry credential.
- The deployment account uses a dedicated forced-command SSH key. The wrapper accepts only `deploy <40-character-lowercase-git-sha>`; sudo grants only the root-owned deployment entrypoint.
- `.env`, Compose, release state, data, upload, plugin, Meilisearch, backup, and release paths must not be symlinks or resolve outside their fixed locations. Validated secret values must be passed explicitly to Compose so ambient environment variables cannot override them.
- Pull all images before stopping writers. Before a migration-capable start, stop writers and create a PocketBase archive plus metadata mapping `previous_release` to `candidate_release`.
- Automatic rollback restores the prior image and its pre-deploy database archive. It must not restore data while candidate writers may still be running.
- Manual rollback is limited to the immediately previous release with an exact metadata mapping. If the older release fails health checks, restore both the current release and its database snapshot.
- Only Nginx exposes the web service at `127.0.0.1:13000`; PocketBase diagnostics remain at `127.0.0.1:18090`; Meilisearch has no host port. Public success requires live-origin verification, not only container health.

## 4. Validation and error matrix

| Condition | Required behavior |
|---|---|
| PR head is not same-repository `dev` | `check-source` fails; merge to `main` is blocked |
| Main CI is missing, pending, or failed for the release SHA | Deployment waits or fails without publishing/deploying a different SHA |
| Workflow dispatch is not from `main` | Fail before image build |
| SHA/tag format is invalid | Exit with usage/configuration error before mutation |
| Anonymous GHCR pull fails | Stop before SSH and explain that both packages must be public |
| Image revision label differs from requested SHA | Reject the candidate before stopping the running release |
| Required secret is absent or malformed | Fail before pulling/stopping services |
| Managed path is a symlink or resolves elsewhere | Refuse deployment or restore |
| Candidate fails after writers stop | Stop candidate writers, restore prior data and image, then verify the prior release |
| Candidate writers cannot be stopped | Do not restore data; retain evidence and exit nonzero |
| Manual rollback lacks exact backup metadata | Refuse to run the older image against newer data |
| Nginx configuration or certificate is invalid | Do not reload or enable the TLS site |
| Host-local health passes but public origin fails | Report production as not publicly online and identify DNS/TLS/proxy as the remaining gate |

## 5. Good, base, and bad cases

- Good: merge `dev` into protected `main`; exact-SHA CI succeeds; Actions builds labeled `linux/amd64` images; anonymous pulls succeed; restricted SSH deploys; both loopback health checks and the public origin pass.
- Base: first deployment has no previous release. Pull and validate images, archive the initially empty data directory, start the release, then write `.release` only after health succeeds.
- Bad: a feature branch targets `main`, a mutable-only tag is used, the server compiles source, a private registry credential is copied to production, a symlink redirects `pb_data`, or old code starts against a newer database without its matching snapshot.

## 6. Tests required

- Run `actionlint`, ShellCheck, Bash syntax checks, YAML parsing, and `docker compose config --quiet` contract tests.
- Verify every script invoked by a workflow is tracked by Git; repository-wide ignore rules such as `run.sh` can silently omit a local test runner.
- Run focused tests for restricted SSH parsing, first-deploy failure, image revision mismatch, symlink rejection, successful deploy, automatic rollback, manual data rollback, and stop-failure restore safety.
- Run Go vet/test/build, plugin tests and WASM builds, Svelte checks/tests/build, docs build, and CI Playwright coverage.
- Before enabling production, create a non-`dev` probe PR and observe `check-source` fail; then close it.
- After merge, verify the GitHub deployment run, `.release`, Compose service state, both loopback endpoints, Nginx configuration, and the public HTTPS origin.

## 7. Wrong versus correct

Wrong:

```bash
ssh production 'git pull && npm ci && npm run build && docker compose up -d --build'
docker compose config
sudo /usr/local/sbin/voyagetrack-rollback <arbitrary-old-sha>
```

Correct:

```bash
# GitHub Actions builds and publishes sha-$GITHUB_SHA with the revision label.
ssh -i "$DEPLOY_SSH_KEY" voyagetrack-deploy@production \
  "deploy $GITHUB_SHA"

# Shared validation never prints resolved secrets.
sudo docker compose --env-file /srv/apps/voyagetrack/.env \
  --file /srv/apps/voyagetrack/compose.yml config --quiet

# Rollback is allowed only when backup metadata maps the active release to this SHA.
sudo /usr/local/sbin/voyagetrack-rollback <immediately-previous-full-sha>
```
